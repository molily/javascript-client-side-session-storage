/*
 * Storage - Cross Document Transport of JavaScript Data
 *
 * Extensible Wrapper for HTML 5's DOM Storage, Microsoft's UserData,
 * Session Cookies and window.name using JSON serialization
 *
 * Author: Mathias Schaefer <molily@mailbox.org>
 * License: Public Domain
 *
 */

/* Namespace */

var storage = {};

/* Helper Functions */

storage.helper = {};

storage.helper.forEach = function(obj, func){
	if (obj.constructor == Array) {
		for (var i = 0, length = obj.length; i < length; i++) {
			var result = func.call(obj, obj[i], i);
			if (result != undefined) return result;
		}
	} else {
		for (var name in obj) {
			if (obj.hasOwnProperty(name)) {
				var result = func.call(obj, obj[name], name);
				if (result != undefined) return result;
			}
		}
	}
	return null;
};

storage.helper.mixin = function (source, target) {
	storage.helper.forEach(source, function (value, name) {
		target[name] = value;
	});
	return target;
};

storage.helper.loadScript = function (uri) {
	var head = document.getElementsByTagName("head")[0],
		el = document.createElement("script");
	el.type = "text/javascript";
	el.src = uri;
	head.appendChild(el);
};

/* Initialization */

storage.init = function () {
	storage.implementation.detect();
};

/* Serializers */

storage.serializers = {};

/* JSON */

storage.serializers.json = {
	scriptUri : "json2.js",
	init : function () {
		/* Load additional script if there's no native JSON */
		if (!window.JSON) {
			storage.helper.loadScript(this.scriptUri);
		}
	},
	serialize : function (object) {
		if (!(window.JSON && JSON.stringify)) return false;
		return JSON.stringify(object);
	},
	unserialize : function (string) {
		if (!(window.JSON || JSON.parse)) return false;
		return JSON.parse(string);
	}
};

/* Implementation Object */

storage.implementation = {};

/* Implementation List */

storage.implementation.list = [];

/* Add an implementation (with possibiliy to mixin a template) */

storage.implementation.add = function (obj1, obj2) {
	var imp = arguments.length == 2 ? storage.helper.mixin(obj1, obj2) : obj1;
	if (imp) {
		/* Push object into the array *and* save it as a property */
		this.list.push(imp);
		this.list[imp.name] = imp;
	}
};

/* Get an implementation by name or index */

storage.implementation.get = function (param) {
	if (typeof param == "string") {
		return storage.helper.forEach(this.list, function (imp) {
			if (imp.name == param) return imp;
		});
	} else if (typeof param == "number") {
		return this.list[param];
	} else {
		return false;
	}
};

/* Auto-Detect available implementation */

storage.implementation.detect = function () {
	var imp = storage.helper.forEach(this.list, function (imp) {
		if (imp.isAvailable()) return imp;
	});
	if (!imp) return;
	this.setup(imp);
};

/* Force an implementation (override auto-detect) */

storage.implementation.force = function (implementationName) {
	this.setup(this.get(implementationName));
};

/* Setup and initialize an implementation */

storage.implementation.setup = function (imp) {
	/* Setup public members */
	storage.helper.forEach(["get", "add", "remove", "clear"], function (methodName) {
		/* Wrap function to call the method with the right context ("this" points to implementation, not storage object) */
		storage[methodName] = function () {
			return imp[methodName].apply(imp, arguments);
		};
	});
	/* Init Implementation */
	imp.init();
	/* Save active implementation as storage.implementation.active */
	this.active = imp;
};


/* Mixins (Implementation Templates) */

storage.implementation.mixins = {};

storage.implementation.mixins.serialized = {
	/* private members */
	init : function () {
		this.serializer.init();
		this.serialize = this.serializer.serialize;
		this.unserialize = this.serializer.unserialize;
		if (this.specificInit) {
			this.specificInit();
		}
	},
	serializer : storage.serializers.json,
	box : null,

	/*
	Implementation specific private methods:
		isAvailable()
		read()
		save()
	*/

	/* public members */
	get : function () {
		if (this.box) return this.box;
		var string = this.read(), obj = {};
		if (string && string.charAt(0) == "{") {
			obj = this.unserialize(string);
		}
		return this.box = obj;
	},
	add : function (obj) {
		if (!this.box) {
			this.box = {};
		}
		storage.helper.mixin(obj, this.box);
		this.save(this.serialize(this.box));
	},
	remove : function (name) {
		if (this.box && name in this.box) {
			delete this.box[name];
			this.save(this.serialize(this.box));
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

/* Implementations */

/* DOM Storage */

storage.implementation.add({

	name : "domstorage",

	/* private members */

	init : function () {},

	isAvailable : function () {
		return Boolean(window.sessionStorage);
	},

	/* public members */

	get : function () {
		return sessionStorage;
	},
	add : function (obj) {
		storage.helper.mixin(obj, sessionStorage);
	},
	remove : function (name) {
		sessionStorage.removeItem(name);
	},
	clear : function () {
		sessionStorage.clear();
	}

});

/* userData */

storage.implementation.add(storage.implementation.mixins.serialized, {

	name : "userdata",

	/* necessary methods */

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

	/* internal members */

	storeName : "storage",

	specificInit : function () {
		this.element = document.documentElement;
		this.element.addBehavior("#default#userData");
	},

	specificClear : function () {
		this.element.expires = new Date(0).toUTCString();
	}

});

/* Cookie */

storage.implementation.add(storage.implementation.mixins.serialized, {

	name : "cookie",

	/* necessary methods */

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

	/* internal members */

	cookieName : "storage",

	specificClear : function () {
		this.deleteCookie(this.cookieName);
	},

	escapeCookie : function (value) {
		/* Just escape semicolon and double quotes (the latter escpecially for Opera),
		that is more economical than encodeURIComponent/decodeURIComponent */
		return value.toString().replace(/%/g, "%%").replace(/;/g, '%S').replace(/"/g, '%Q');
	},
	unescapeCookie : function (value) {
		return value.replace(/%Q/g, '"').replace(/%S/g, ";").replace(/%%/g, "%");
	},

	getCookie : function (name) {
		var pairs = document.cookie.split(/;\s*/),
			value = storage.helper.forEach(pairs, function (str) {
				if (!str) return;
				var separatorPosition = str.indexOf("="),
					testName = str.substring(0, separatorPosition);
				if (testName == name) {
					return str.substring(separatorPosition + 1);
				}
			});
		if (!value) return false;
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

/* window.name */

storage.implementation.add(storage.implementation.mixins.serialized, {

	name : "windowname",

	/* necessary methods */

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

/* Call Init */

storage.init();