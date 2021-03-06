define(['underscore', 'require', 'tabmanager'], function (_, require, tabmanager) {

    var settings = {};

    settings.paused = false;
    settings.enableSync = true;

    var defaults = {
        minutesInactive: 20, // How many minutes before we consider a tab "stale" and ready to close.
        minTabs: 5, // Stop acting if there are only minTabs tabs open.
        maxExceededTime: 5, // How many minutes max tabs can be exceeded before tabs start to close.
        purgeClosedTabs: false, // Save closed tabs in between browser sessions.
        showBadgeCount: true, // Save closed tabs in between browser sessions.
        removeCorralDupes: true, // Remove duplicate tabs from the corral by comparing URL
        countPerWindow: true,
        whitelist: [] // An array of patterns to check against.  If a URL matches a pattern, it is never locked.
    };

    var setters = {};
    var getters = {};

    var cache = {};

    // Gets all settings from sync and stores them locally.
    settings.init = function () {
        chrome.storage.local.get({enableSync: settings.enableSync, paused: settings.paused}, function (sync) {

            settings.enableSync = sync.enableSync;
            setters.setpaused(sync.paused);

            if (settings.enableSync) {
                chrome.storage.sync.get(defaults, function (items) {
                    _.extend(cache, items);
                });
            } else {
                chrome.storage.local.get(defaults, function (items) {
                    _.extend(cache, items);
                });
            }
        });
    };

    // Whenever settings change in sync, copy them to cache
    settings.copySyncChanges = function (changes, area) {
        if (area == 'sync' && settings.enableSync) {
            var changeList = _.map(changes, function (change, key) {
                return [key, change.newValue];
            });
            var changeObject = _.object(changeList);
            _.extend(cache, changeObject);
        }
    };

    settings.set = function (key, value) {
        if (typeof setters['set' + key] == 'function') {
            return setters['set' + key](value);
        }
        setValue(key, value)
    };

    var setValue = function (key, value) {
        var items = {};
        items[key] = value;
        cache[key] = value;

        // Set the appropriate storage location
        if (settings.enableSync) {
            chrome.storage.sync.set(items);
        } else {
            chrome.storage.local.set(items);
        }
    };

    settings.get = function (key) {
        if (typeof getters[key] == 'function') {
            return getters[key]();
        }
        return cache[key];
    };

    getters.stayOpen = function () {
        return parseInt(settings.get('minutesInactive')) * 60 * 1000;
    };

    getters.maxExceededTimeMilliseconds = function () {
        return parseInt(settings.get('maxExceededTime')) * 60 * 1000;
    };

    /* Sets the enableSync attribute, which is only stored locally. */
    setters.setenableSync = function (value) {
        if (settings.enableSync == value) {
            return;
        }

        settings.enableSync = value;

        chrome.storage.local.set({enableSync: value}, function () {

            if (value) {
                settings.init();
            } else {
                chrome.storage.local.set(cache);
            }
        });
    };

    setters.setpaused = function (value) {
        if (settings.paused == value) {
            return
        }

        settings.paused = value;

        chrome.storage.local.set({paused: value}, function () {
            if (value) {
                require('tabmanager').unscheduleAllTabs();
                chrome.browserAction.setIcon({'path': 'img/icon-paused.png'});
            } else {
                require('tabmanager').resetMaxExceededTime();
                chrome.browserAction.setIcon({'path': 'img/icon.png'});
            }
        })
    };

    setters.setminutesInactive = function (value) {
        if (isNaN(parseInt(value)) || parseInt(value) < 0) {
            throw Error("Minutes Inactive must be at least 0");
        }

        setValue('minutesInactive', value);

        // Reschedule all schedule tabs since we changed the setting
        require('tabmanager').rescheduleAllTabs();
    };

    setters.setminTabs = function (value) {
        if (isNaN(parseInt(value)) || parseInt(value) < 1) {
            throw Error("Minimum tabs must be a number that is greater than 0");
        }
        var oldValue = settings.get('minTabs');
        setValue('minTabs', value);

        /* Make sure the tab scheduling is correct. */
        if (parseInt(value) > oldValue) {
            require('tabmanager').unscheduleAllTabs();
        }
        require('tabmanager').scheduleNextClose();
    };

    setters.setshowBadgeCount = function (value) {
        if (value == false) {
            // Clear out the current badge setting
            chrome.browserAction.setBadgeText({text: ""});
        }
        setValue('showBadgeCount', value);
    };

    setters.setwhitelist = function (value) {
        setValue('whitelist', value);
        require('tabmanager').rescheduleAllTabs();
    };

    settings.addWhitelist = function (value) {
        cache.whitelist.push(value);
        setters.setwhitelist(cache.whitelist);
    };

    settings.removeWhitelistByIndex = function (index) {
        cache.whitelist.splice(index, 1);
        settings.setwhitelist(cache.whitelist);
    };

    setters.setcountPerWindow = function (value) {
        setValue('countPerWindow', value);
        require('tabmanager').rescheduleAllTabs();
    };

    setters.setmaxExceededTime = function (value) {
        if (isNaN(parseInt(value)) || parseInt(value) < 0) {
            throw Error("Max exceeded time must be at least 0");
        }

        setValue('maxExceededTime', value);
        require('tabmanager').rescheduleAllTabs();
    };

    return settings;
});