/*
 * Session Storage Wrapper - Cross Document Transport of JavaScript Data
 * 
 * Extensible Wrapper for HTML 5's DOM Storage, Microsoft's UserData,
 * Session Cookies and window.name using JSON serialization
 * 
 * Author: Mathias Schaefer <molily@selfhtml.org>
 * License: Public Domain
 * 
 */

/* Anonymous Function Wrapper to establish a local variable scope */

(function () {
	
	/* ******************************************************************** */
	/* Public Interface Name */
	
	var publicInterfaceName = "ssw";

	/* ******************************************************************** */
	/* Helper Functions */
	
	var helper = {
		
		/*
		 * Iteration of objects and arrays
		 * Fire the callback function for each member and break if it returns a value.
		 * In this case, pass this return value on.
		 * The callback gets the member as first parameter, the index or name as second.
		 * In the callback, "this" points to the object or array.
		 */
		
		forEach : function (obj, func) {
			/*
			if (obj.constructor == Array) {
				// Array
				for (var i = 0, length = obj.length; i < length; i++) {
					var result = func.call(obj, obj[i], i);
					if (result != undefined) {
						return result;
					}
				}
			} else {
			*/
				// Object
				for (var name in obj) {
					if (obj.hasOwnProperty(name)) {
						var result = func.call(obj, obj[name], name);
						if (result != undefined) {
				  			return result;
				  		}
					}
				}
			/* } */
			return null;
		},
		
		/*
		 * Copy all members of one object to another object
		 * (objects are referenced, primitives are copied)
		 */
		
		mixin : function (source, target) {
			helper.forEach(source, function(value, name) {
				target[name] = value;
			});
			return target;
		},
		
		/*
		 * Bind a function to an object so the "this" keyword points to the given object
		 */
		
		bind : function (func, obj) {
			return function() {
				return func.apply(obj, arguments);
			};
		},
		
		/*
		 * Load an external JavaScript file by inserting a script element
		 */
		
		loadScript : function (uri) {
			var head = document.getElementsByTagName("head")[0],
				el = document.createElement("script");
			el.type = "text/javascript";
			el.src = uri;
			head.appendChild(el);
		}
		
	};

	/* ******************************************************************** */
	/* Serializers */

	var serializers = {
		
		/* JSON Serializer */
		
		json : {
			
			/* URI of the JSON script */
			
			scriptUri: "json2.js",
			
			init : function () {
				/* Load additional script if there's no native JSON implementation */
				if (!window.JSON) {
					helper.loadScript(this.scriptUri);
				}
			},
			
			serialize : function (object) {
				if (!(window.JSON && JSON.stringify)) {
					return false;
				}
				return JSON.stringify(object);
			},
			
			unserialize : function (string) {
				if (!(window.JSON || JSON.parse)) {
					return false;
				}
				return JSON.parse(string);
			}
			
		}
		
	};

	/* ******************************************************************** */
	/* Implementation Object */
	
	var implementation = {
		
		/* Implementation List (an array and a hash at the same time) */
		
		list: [],
		
		/* Add an implementation (with possibility to mixin a template) */
		
		add : function (obj1, obj2) {
			/* Prepare implementation object, mixin template if two objects are given */
			var imp = arguments.length == 1 ? obj1 : helper.mixin(obj1, obj2);
			if (imp) {
				/* 
				 * Push the object into the array *and* save it as a property
				 * so we can retrieve it by index or name
				 */
				this.list.push(imp);
				this.list[imp.name] = imp;
			}
		},
		
		/* Get an implementation object by index or name */
		
		get : function (param) {
			return this.list[param];
		},
		
		/* Auto-Detect available implementation */
		
		detect : function () {
			/* Iterate over implementation list and find the first supported implementation */
			var imp = helper.forEach(this.list, function(imp) {
				if (imp.isAvailable()) {
					return imp;
				}
			});
			/* Break if no implementation is supported, otherwise set up the found implementation */
			if (!imp) {
			 	return;
			 }
			this.setup(imp);
		},
		
		/* Force an implementation (override auto-detect) */
		
		force : function (name) {
			this.setup(this.get(name));
		},
		
		/* Setup and initialize an implementation */
		
		setup : function (imp) {
			/* Call specific init function of the implementation */
			imp.init();
			
			/* Set up the public interface object */
			var publicInterface = {};
			
			/* Provide core methods */
			helper.forEach(["get", "add", "remove", "clear"], function(methodName) {
				/* Copy the bound function to the public interface */
				publicInterface[methodName] = helper.bind(imp[methodName], imp);
			});
			
			/* Provide force implementation method */
			publicInterface.forceImplementation = helper.bind(this.force, this);
			
			/* Provide active implementation */
			publicInterface.implementation = imp;
			
			/* Finally, create global object */
			if (publicInterfaceName in window) {
				/* break if there's already a global object with this name */
				return;
			}
			window[publicInterfaceName] = publicInterface;
		}
	
	};

	/* ******************************************************************** */
	/* Implementation Templates (Mixins) */

	var mixins = {
		
		/* Template for implementations which save all data in a serialized string */
		
		serialized: {
			
			/* Private members */
			
			/* Use JSON as standard serializer */
			
			serializer: serializers.json,
			
			/* Store Object */
			
			box: {},
			
			/* Initialization */
			
			init : function () {
				/* Initialize serializer and set up function references */
				this.serializer.init();
				
				/* Call specific init method */
				if (this.specificInit) {
					this.specificInit();
				}

				/* Initial reading and unserializing */
				var string = this.read();
				if (string && string.charAt(0) == "{") {
					this.box = this.serializer.unserialize(string);
				}
			},
			
			/*
			 * Implementation specific private methods:
			 * 	isAvailable
			 * 	read
			 * 	save
			 * 	specificInit   (optional)
			 * 	specificClear   (optional)
			 */
			
			/* Public members */
			
			get : function (param1) {
				return param1 != undefined ? this.box[param1] : this.box;
			},
			
			add : function (param1, value) {
				if (arguments.length == 1) {
					helper.mixin(param1, this.box);
				} else {
					this.box[param1] = value;
				}
				this.save(this.serializer.serialize(this.box));
			},
			
			remove : function (name) {
				if (name in this.box) {
					delete this.box[name];
					this.save(this.serializer.serialize(this.box));
				}
			},
			
			clear : function () {
				this.box = {};
				this.save();
				if (this.specificClear) {
					this.specificClear();
				}				
			}
		}
	};
	
	/* ******************************************************************** */
	/* Implementations */
	
	/* -------------------------------------------------------------------- */
	/* DOM Storage */
	
	implementation.add({
		
		name: "domstorage",
		
		/* Private members */
		
		init : function () {
			/* empty */
		},
		
		isAvailable : function () {
			return Boolean(window.sessionStorage);
		},
		
		/* Public members */
		
		get : function (param1) {
			return param1 != undefined ? sessionStorage.getItem(param1) : sessionStorage;
		},
		
		add : function (param1, value) {
			if (arguments.length == 1) {
				helper.mixin(obj, sessionStorage);
			} else {
				sessionStorage.addItem(param1, value);
			}
		},
		
		remove : function (name) {
			sessionStorage.removeItem(name);
		},
		
		clear : function () {
			sessionStorage.clear();
		}
	
	});
	
	/* -------------------------------------------------------------------- */
	/* userData, using serialized template */
	
	implementation.add(mixins.serialized, {
		
		name: "userdata",
		
		/* Necessary methods */
		
		isAvailable : function () {
			return Boolean(document.documentElement && document.documentElement.addBehavior);
		},
		
		read : function () {
			this.element.load(this.storeName);
			return this.element.getAttribute(this.storeName);
		},
		
		save : function (serializedString) {
			this.element.setAttribute(this.storeName, serializedString);
			this.element.save(this.storeName);
		},
		
		/* Internal members */
		
		storeName: "_sessionstorage",
		
		specificInit : function () {
			/* Create a non-existing element and append it to the root element */
			this.element = document.createElement(this.storeName);
			document.documentElement.appendChild(this.element);
			/* Apply userData behavior */
			this.element.addBehavior("#default#userData");
		},
		
		specificClear : function () {
			this.element.expires = new Date(0).toUTCString();
		}
		
	});

	/* -------------------------------------------------------------------- */
	/* Cookie, using serialized template */
	
	implementation.add(mixins.serialized, {
		
		name: "cookie",
		
		/* Necessary methods */
		
		isAvailable : function () {
			var v = "storage-test";
			this.setCookie(v, v);
			return this.getCookie(v) == v ? (this.deleteCookie(v), true) : false;
		},
		
		read : function () {
			return this.getCookie(this.cookieName);
		},
		
		save : function (serializedString) {
			this.setCookie(this.cookieName, serializedString);
		},
		
		/* Internal members */
		
		cookieName: "storage",
		
		specificClear : function () {
			this.deleteCookie(this.cookieName);
		},
		
		escapeCookie : function (value) {
			/*
			 * Just escape semicolon and double quotes (the latter escpecially for Opera),
			 * which is more economic than using encodeURIComponent/decodeURIComponent.
			 */
			return value.replace(/%/g, "%%").replace(/;/g, "%S").replace(/"/g, '%Q');
		},
		
		unescapeCookie : function (value) {
			return value.replace(/%Q/g, '"').replace(/%S/g, ";").replace(/%%/g, "%");
		},
		
		getCookie : function (name) {
			var pairs = document.cookie.split(/;\s*/),
				value = helper.forEach(pairs, function(str) {
					if (!str)
						return;
					var separatorPosition = str.indexOf("="),
						testName = str.substring(0, separatorPosition);
					if (testName == name) {
						return str.substring(separatorPosition + 1);
					}
				});
			if (!value) {
				return false;
			}
			return this.unescapeCookie(value);
		},
		
		setCookie : function (name, value) {
			var cookieString = name + "=" + this.escapeCookie(value);
			if (cookieString.length > 4096) {
				throw new Error("Storage: Cookie size exceeds 4096 byte limit");
			}
			document.cookie = cookieString;
		},
		
		deleteCookie : function (name) {
			document.cookie = name + '=;expires=' + new Date(0).toUTCString();
		}
		
	});
	
	/* -------------------------------------------------------------------- */
	/* Window name, using serialized template */
	
	implementation.add(mixins.serialized, {
		
		name: "windowname",
		
		/* Necessary methods */
		
		isAvailable : function () {
			return (typeof window.name != "undefined");
		},
		
		read : function () {
			return window.name;
		},
		
		save : function (serializedString) {
			window.name = serializedString;
		}
		
	});
	
	/* ******************************************************************** */
	
	/* Call auto-detect */	
	implementation.detect();
	
	/* 
	 * Delete the implementation object to free some memory. Otherwise
	 * it would be kept in memory due to the many closures (nested functions).
	 */
	delete implementation;

	/* Call the anonymous function */
})();