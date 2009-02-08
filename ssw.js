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
			if (obj.constructor == Array) {
				// Array (defined order)
				for (var i = 0, length = obj.length; i < length; i++) {
					var result = func.call(obj, obj[i], i);
					if (result != undefined) {
						return result;
					}
				}
			} else {
				// Object (order not relevant)
				for (var name in obj) {
					if (obj.hasOwnProperty(name)) {
						var result = func.call(obj, obj[name], name);
						if (result != undefined) {
				  			return result;
				  		}
					}
				}
			}
			return null;
		},
		
		/*
		 * Copy all members of one object to another object
		 * (objects are referenced, primitives are copied)
		 */
		
		mixin : function (source, target) {
			helper.forEach(source, function (value, name) {
				target[name] = value;
			});
			return target;
		},
		
		/*
		 * Bind a function to an object so the "this" keyword points to the given object
		 */
		
		bind : function (func, obj) {
			return function () {
				return func.apply(obj, arguments);
			};
		},
		
		/*
		 * Load an external JavaScript file by inserting a script element
		 */
		
		loadScript : function (uri) {
			/*
			if (document.write) {
				try {
					document.write("<script type='text/javascript' src='" + uri + "'><\/script>");
				} catch (e) {
					throw new Error("External script could not be loaded because document.write threw an exception");
				}
			}
			*/
			/* This loads the script asynchronously and it cannot be guaranteed that the script
			is fully loaded and executed when the SSW library is used. */				
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
			
			scriptUri: "../json2.js",
			
			init : function () {
				/* Load additional script if there's no native JSON implementation */
				if (!window.JSON) {
					helper.loadScript(this.scriptUri);
				}
			},
			
			serialize : function (object) {
				if (!(window.JSON && JSON.stringify)) {
					throw new Error("JSON serialization not available");
				}
				return JSON.stringify(object);
			},
			
			unserialize : function (string) {
				if (!(window.JSON || JSON.parse)) {
					throw new Error("JSON parsing not available");
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
				 * so we can retrieve it by index or name.
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
			var imp = helper.forEach(this.list, function (imp) {
				if (imp.isAvailable()) {
					imp.available = true;
					return imp;
				} else {
					imp.available = false;
				}
			});
			this.setup(imp);
		},
		
		/* Force an implementation (override auto-detect, but check availability) */
		
		force : function (name) {
			var imp = this.get(name);
			if (!imp.available) {
				imp = false;
			}
			this.setup(imp);
		},
		
		/* Setup and initialize an implementation */
		
		setup : function (imp) {
			/* Break if there's already a global object with this name */
			if (publicInterfaceName in window) {
				return;
			}
			
			/* If no implementation is supported, set the global object to false and break */
			if (!imp) {
				window[publicInterfaceName] = false;
			 	return;
			 }

			/* Call the specific init function of the implementation */
			imp.init();
			
			/* Set up the public interface object */
			var publicInterface = {
				/* Provide active (auto-detected) implementation */
				implementation : imp,
				/* Provide method to force another implementation */
				forceImplementation : helper.bind(this.force, this)
			};

			/* Provide core methods from the implementation */
			helper.forEach(["get", "add", "remove", "clear"], function (methodName) {
				/* Copy the bound function to the public interface */
				publicInterface[methodName] = helper.bind(imp[methodName], imp);
			});
			
			/* Finally, create the global object */
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
			
			box: null,
			
			/* Initialization */
			
			init : function () {
				/* Initialize serializer. For JSON, this loads the external script file asynchronously,
				so we cannot use the serializer during the initialization. */
				this.serializer.init();
				
				/* Call the specific init method */
				if (this.specificInit) {
					this.specificInit();
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
			
			/* Internal members */
			
			readBox : function () {
				/* Initial reading and unserializing if box hasn't been set up */
				if (this.box) {
					return;
				}
				var string = this.read();
				this.box = string && string.charAt(0) == "{" ? this.serializer.unserialize(string) : {};
			},

			saveBox : function () {
				this.save(this.serializer.serialize(this.box));
			},

			/* Public members */
			
			get : function (param1) {
				this.readBox();
				return param1 != undefined ? this.box[param1] : this.box;
			},
			
			add : function (param1, value) {
				this.readBox();
				if (arguments.length == 1) {
					helper.mixin(param1, this.box);
				} else {
					this.box[param1] = value;
				}
				this.saveBox();
			},
			
			remove : function (name) {
				this.readBox();
				if (name in this.box) {
					delete this.box[name];
					this.saveBox();
				}
			},
			
			clear : function () {
				this.box = {};
				this.saveBox();
				if (this.specificClear) {
					this.specificClear();
				}				
			}
		}
	};
	
	/* ******************************************************************** */
	/* Implementations */
	
	/* -------------------------------------------------------------------- */
	/* DOM Storage, using serialized template */
	
	implementation.add(mixins.serialized, {
		
		name: "domstorage",

		/* Necessary methods */
		
		isAvailable : function () {
			return Boolean(window.sessionStorage);
		},
		
		read : function () {
			var serializedString = sessionStorage.getItem(this.storeName);
			return serializedString === null ? "" : serializedString.toString();
		},
		
		save : function (serializedString) {
			return sessionStorage.setItem(this.storeName, serializedString);
		},
		
		/* Internal members */

		storeName : publicInterfaceName,
		
		specificInit : function () {
		},
		
		specificClear : function () {
		}
		
	});
	
	/* -------------------------------------------------------------------- */
	/* userData, using serialized template */
	
	implementation.add(mixins.serialized, {
		
		name : "userdata",
		
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
		
		storeName : publicInterfaceName,
		
		specificInit : function () {
			/* Create a non-existing element and append it to the root element */
			var el = document.createElement(this.storeName);
			document.documentElement.appendChild(el);
			/* Apply userData behavior */
			el.addBehavior("#default#userData");
			this.element = el;
		},
		
		specificClear : function () {
			/* Expire at once */
			this.element.expires = new Date(0).toUTCString();
		}
		
	});

	/* -------------------------------------------------------------------- */
	/* Cookie, using serialized template */
	
	implementation.add(mixins.serialized, {
		
		name : "cookie",
		
		/* Necessary methods */
		
		isAvailable : function () {
			/* Try to set and get a cookie to test if session cookies are allowed */
			var s = this.cookieName + "-test";
			this.setCookie(s, s);
			return this.getCookie(s) == s ? (this.deleteCookie(s), true) : false;
		},
		
		read : function () {
			return this.getCookie(this.cookieName);
		},
		
		save : function (serializedString) {
			if (!serializedString) {
				/* break if the string is empty */
				return;
			}
			this.setCookie(this.cookieName, serializedString);
		},
		
		/* Internal members */
		
		cookieName : publicInterfaceName,
		
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
				value = helper.forEach(pairs, function (str) {
					if (!str) {
						return;
					}
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
				throw new Error("Cookie size exceeds 4096 byte limit");
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