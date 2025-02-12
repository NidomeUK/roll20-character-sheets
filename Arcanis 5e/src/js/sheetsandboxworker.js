/* eslint-disable import/no-unresolved */
/* eslint-disable no-eval */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-console */
/* eslint-disable strict */
/* eslint-disable no-param-reassign */
/* eslint-disable func-names */
import _ from './underscore';
import jQueryShim from './jqueryShim';
import sandboxMessageHandler from './sandboxMessageHandler';
import generateUUID from '../../util/generateUUID';
import checkForValidKeys from '../../util/checkForValidKeys';

(function (self, globalEval, globalUnderscore, globalGenerateUUID, JQuery) {
	'use strict';

	self._ = globalUnderscore;

	const { postMessage } = self;

	// Putting these variables in an object makes them easy to pass to modules
	// and allows us to pass them all by reference
	const workerGlobals = {
		activeCharacterId: false,
		registeredCallbacks: {},
		activeRepeatingField: false,
		activeTrigger: false,
		translationStrings: {},
		translationLanguage: '',
		charmancerData: {},
		waitingAttrRequests: {},
	};

	const generateAttrID = function () {
		return Math.random();
	};

	const generateRequestId = function () {
		return `${workerGlobals.activeCharacterId}//${workerGlobals.activeRepeatingField}//${generateAttrID()}`;
	};

	const fullfillAttrReq = function (reqid, result) {
		if (workerGlobals.waitingAttrRequests[reqid]) {
			const prevCharacterId = workerGlobals.activeCharacterId;
			[workerGlobals.activeCharacterId] = reqid.split('//');

			const prevActiveRepeatingField = workerGlobals.activeRepeatingField;
			const possibleRepeatingField = reqid.split('//')[1];
			if (possibleRepeatingField !== 'false') {
				workerGlobals.activeRepeatingField = possibleRepeatingField;
			} else {
				workerGlobals.activeRepeatingField = false;
			}

			workerGlobals.waitingAttrRequests[reqid](result);

			workerGlobals.activeCharacterId = prevCharacterId;
			workerGlobals.activeRepeatingField = prevActiveRepeatingField;

			delete workerGlobals.waitingAttrRequests[reqid];
		}
	};

	let port2;

	self.on = function (eventname, callback) {
		eventname = eventname.toLowerCase();
		const multievents = eventname.split(' ');
		for (let i = 0; i < multievents.length; i += 1) {
			if (!workerGlobals.registeredCallbacks[multievents[i]]) {
				workerGlobals.registeredCallbacks[multievents[i]] = [];
			}
			workerGlobals.registeredCallbacks[multievents[i]].push(callback);
		}
	};

	self.trigger = function (eventinfo) {
		let finalattrname = eventinfo.eventname.toLowerCase();
		const triggername = eventinfo.eventname.toLowerCase();
		if (finalattrname.includes('repeating_') && !eventinfo.mancer) {
			const splitname = eventinfo.eventname.split('_');
			if (splitname.length > 2) {
				if (splitname.length > 3) {
					finalattrname = `${splitname[0]}_${splitname[1]}:${splitname.splice(3, splitname.length).join('_')}`;
				} else {
					finalattrname = `${splitname[0]}_${splitname[1]}`;
				}
				workerGlobals.activeRepeatingField = `repeating_${splitname[1]}_${splitname[2]}`;
			}
		} else {
			workerGlobals.activeRepeatingField = false;
		}

		if (eventinfo.mancer) {
			if (eventinfo.mancer === 'page') {
				finalattrname = `page:${finalattrname}`;
			} else if (eventinfo.mancer === 'mancer') {
				finalattrname = `mancerchange:${finalattrname}`;
			} else if (eventinfo.mancer === 'finish') {
				finalattrname = `mancerfinish:${finalattrname}`;
			} else if (eventinfo.mancer === 'cancel') {
				finalattrname = 'mancer:cancel';
			}
		} else if (finalattrname.substring(0, 8) === "clicked:" || finalattrname.substring(0, 11) === "mancerroll:") {
			finalattrname = finalattrname;
		} else if (finalattrname.substring(0, 6) !== 'sheet:' && finalattrname.substring(0, 7) !== 'remove:') {
			finalattrname = `change:${finalattrname}`;
		}

		const subname = finalattrname;
		let info = {
			sourceAttribute: eventinfo.oattr,
			sourceType: eventinfo.sourcetype,
			triggerName: triggername,
		};

		if (eventinfo.currentstep) {
			info.currentStep = eventinfo.currentstep;
		}
		if (eventinfo.previous_value) {
			info.previousValue = eventinfo.previous_value;
		}
		if (eventinfo.updated_value) {
			info.newValue = eventinfo.updated_value;
		}
		if (eventinfo.removed_info) {
			info.removedInfo = eventinfo.removed_info;
		}
		if (eventinfo.mancer === 'finish') {
			info = { data: eventinfo.data };
		}
		if (eventinfo.mancer === 'cancel') {
			info = { value: eventinfo.eventname.toLowerCase() };
		}
		if (finalattrname.substring(0, 11) === 'mancerroll:') {
			info.roll = eventinfo.data;
		}

		['triggerType', 'sourceSection', 'originalRollId', 'htmlAttributes'].forEach((prop) => {
			if (eventinfo[prop]) info[prop] = eventinfo[prop];
		});

		// console.log("Triggering for " + subname);

		[, workerGlobals.activeTrigger] = subname.split(':');

		if (workerGlobals.registeredCallbacks[subname]) {
			for (let j = 0; j < workerGlobals.registeredCallbacks[subname].length; j += 1) {
				workerGlobals.registeredCallbacks[subname][j](info);
			}
		}
	};

	self.log = function (msg) {
		console.log(msg);
	};

	self.generateUUID = globalGenerateUUID;

	self.generateRowID = function () {
		return self.generateUUID().replace(/_/g, 'Z');
	};

	// Set $20 to alias to our JQuery shim
	self.$20 = function (selector) {
		return new JQuery(selector, port2, workerGlobals);
	};

	self.getAttrs = function (arrayOfNames, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do getAttrs when no character is active in sandbox.');
			return;
		}

		const reqid = generateRequestId();
		workerGlobals.waitingAttrRequests[reqid] = callback;
		postMessage({
			type: 'attrreq',
			data: arrayOfNames,
			id: reqid,
		});
	};

	self.setAttrs = function (values, options, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do setAttrs when no character is active in sandbox.');
			return;
		}

		if (callback === undefined && (typeof options === 'function')) {
			callback = options;
			options = {};
		}

		const myopts = {};
		if (options && options.silent === true) {
			myopts.silent = true;
		}

		const reqid = generateRequestId();

		if (callback !== undefined) {
			workerGlobals.waitingAttrRequests[reqid] = callback;
		}

		postMessage({
			type: 'setattrs',
			data: values,
			characterid: workerGlobals.activeCharacterId,
			repeatingfield: workerGlobals.activeRepeatingField,
			options: myopts,
			id: reqid,
		});
	};

	self.getSectionIDs = function (sectionid, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do getSectionIDs when no character is active in sandbox.');
			return;
		}

		const reqid = generateRequestId();
		workerGlobals.waitingAttrRequests[reqid] = callback;
		postMessage({
			type: 'attrlist',
			data: sectionid,
			id: reqid,
		});
	};

	self.setSectionOrder = function (repeatingSection, sectionArray, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do setSectionOrder when no character is active in sandbox.');
			return;
		}

		const reqid = `${workerGlobals.activeCharacterId}//${repeatingSection}//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;
		postMessage({
			type: 'setsectionorder',
			data: sectionArray,
			id: reqid,
		});
	};

	self.getTranslationByKey = function (translationKey) {
		if (!workerGlobals.translationStrings[translationKey]) {
			console.log(`Translation Error: the key [${translationKey}] is not in the translation object.`);
			return false;
		}
		return workerGlobals.translationStrings[translationKey];
	};

	self.getTranslationLanguage = function () {
		return workerGlobals.translationLanguage;
	};

	self.removeRepeatingRow = function (rowid) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do removeRepeatingRow when no character is active in sandbox.');
			return;
		}

		const reqid = generateRequestId();

		postMessage({
			type: 'removerepeatingrow',
			data: rowid,
			id: reqid,
		});
	};

	self.forceSheetRender = function () {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do forceSheetRender when no character is active in sandbox.');
			return;
		}

		const reqid = generateRequestId();

		postMessage({
			type: 'forcerender',
			data: '',
			id: reqid,
		});
	};

	self.getActiveCharacterId = function () {
		return workerGlobals.activeCharacterId;
	};

	self.getActiveRepeatingField = function () {
		return workerGlobals.activeRepeatingField;
	};

	self.setDefaultToken = function (values) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do setDefaultToken when no character is active in sandbox.');
			return;
		}

		const reqid = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;

		postMessage({
			type: 'setdefaulttoken',
			data: values,
			characterid: workerGlobals.activeCharacterId,
			id: reqid,
		});
	};

	self.getCompendiumPage = function (uniquePageName, savefields, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do get a Compendium page when no character is active in sandbox.');
			return;
		}
		if (workerGlobals.activeTrigger === false) {
			console.log('Character Sheet Error: Cannot get a Compendium page without an event trigger.');
			return;
		}
		if (!uniquePageName || uniquePageName === '') {
			uniquePageName = '';
			console.log('Trying to fetch Compendium page, but no page specified.');
		}

		if (callback === undefined) {
			callback = savefields;
			savefields = [];
		}

		const reqid = `${workerGlobals.activeCharacterId}//${uniquePageName}//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;
		postMessage({
			type: 'getcompendiumpage',
			data: uniquePageName,
			savefields,
			field: workerGlobals.activeTrigger,
			charid: workerGlobals.activeCharacterId,
			id: reqid,
		});
	};

	self.getCompendiumQuery = function (compendiumQuery, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do get a Compendium page when no character is active in sandbox.');
			return;
		}
		if (!compendiumQuery || compendiumQuery === '') {
			console.log('Trying to query the Compendium, but no page was given.');
			return;
		}
		if (typeof compendiumQuery === 'string') {
			compendiumQuery = [compendiumQuery];
		}

		const reqid = `${workerGlobals.activeCharacterId}//${compendiumQuery}//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;
		postMessage({
			type: 'getcompendiumquery',
			data: compendiumQuery,
			charid: workerGlobals.activeCharacterId,
			id: reqid,
		});
	};

	self.dropCompendiumData = function (targetClass, compendiumData, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to drop Compendium data when no character is active in sandbox.');
			return;
		}
		if (!compendiumData || compendiumData === null || typeof compendiumData !== 'object') {
			console.log('Trying to drop Compendium data, but data is not valid.');
			return;
		}

		if (!targetClass || targetClass === '') {
			console.log('Trying to drop Compendium data, but no compendium drop target was specified.');
			return;
		}

		const reqid = `${workerGlobals.activeCharacterId}//${targetClass}//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;
		postMessage({
			type: 'dropcompendiumdata',
			data: compendiumData,
			id: reqid,
		});
	};

	self.startCharactermancer = function (buildType) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		postMessage({
			type: 'startcharactermancer',
			data: buildType,
			id: workerGlobals.activeCharacterId,
		});
	};

	self.changeCompendiumPage = function (targetClass, uniquePageName, options) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to display a compendium page when no character is active in sandbox.');
			return;
		}

		postMessage({
			type: 'changecompendiumpage',
			data: uniquePageName,
			target: targetClass,
			options,
			id: workerGlobals.activeCharacterId,
		});
	};

	self.showChoices = function (classArray) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		if (!Array.isArray(classArray) || classArray.length < 1) {
			console.log('Character Sheet Error: Trying to show choices but no choices were provided.');
			return;
		}

		postMessage({
			type: 'showchoices',
			data: classArray,
			id: workerGlobals.activeCharacterId,
		});
	};

	self.hideChoices = function (classArray) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		if ((!Array.isArray(classArray) || classArray.length < 1) && classArray !== undefined) {
			console.log('Character Sheet Error: Trying to hide choices but no choices were provided.');
			return;
		}

		postMessage({
			type: 'hidechoices',
			data: classArray,
			id: workerGlobals.activeCharacterId,
		});
	};

	self.setCharmancerText = function (updates) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		if (updates === null || typeof updates !== 'object' || Object.keys(updates).length < 1) {
			console.log('Character Sheet Error: Trying to set charactermancer text but no updates were provided.');
			return;
		}

		postMessage({
			type: 'setcharmancertext',
			data: updates,
			id: workerGlobals.activeCharacterId,
		});
	};

	self.addRepeatingSection = function (target, section, name, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		if (!section || typeof section !== 'string') {
			console.log("Character Sheet Error: Trying to insert a repeating section, but the section wasn't specified.");
			return;
		}

		if (!callback && typeof name === 'function') {
			callback = name;
			name = false;
		}

		const reqid = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;

		postMessage({
			type: 'addrepeatingsection',
			target,
			section,
			name,
			charid: workerGlobals.activeCharacterId,
			id: reqid,
		});
	};

	self.clearRepeatingSections = function (target, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		const reqid = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;
		if (callback) {
			workerGlobals.waitingAttrRequests[reqid] = callback;
		}

		postMessage({
			type: 'clearrepeatingsections',
			target,
			charid: workerGlobals.activeCharacterId,
			id: reqid,
		});
	};

	self.getRepeatingSections = function (target, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		if (!callback) {
			callback = target;
			target = false;
		}
		const reqid = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;

		postMessage({
			type: 'getrepeatingsections',
			target,
			charid: workerGlobals.activeCharacterId,
			id: reqid,
		});
	};

	self.clearRepeatingSectionById = function (repids, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		if (repids === null) {
			console.log('Character Sheet Error: Trying to remove a repeating section, but no section was specified.');
			return;
		}

		if (typeof repids === 'string') {
			repids = [repids];
		}

		const reqid = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;
		if (callback) {
			workerGlobals.waitingAttrRequests[reqid] = callback;
		}

		postMessage({
			type: 'clearrepeatingsections',
			repids,
			charid: workerGlobals.activeCharacterId,
			id: reqid,
		});
	};

	self.setCharmancerOptions = function (targetClass, selectOptions, options, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		options = options || {};

		const reqid = `${workerGlobals.activeCharacterId}//${targetClass}//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;
		postMessage({
			type: 'setcharmanceroptions',
			data: selectOptions,
			options,
			target: targetClass,
			id: workerGlobals.activeCharacterId,
			reqid,
		});
	};

	self.disableCharmancerOptions = function (targetClass, disable, options) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		options = options || {};

		postMessage({
			type: 'disablecharmanceroptions',
			data: disable,
			options,
			target: targetClass,
			id: workerGlobals.activeCharacterId,
		});
	};

	self.getCharmancerData = function () {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}
		delete workerGlobals.charmancerData[workerGlobals.activeCharacterId].undefined;
		// eslint-disable-next-line consistent-return
		return workerGlobals.charmancerData[workerGlobals.activeCharacterId];
	};

	self.deleteCharmancerData = function (pages, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to start the Charactermancer when no character is active in sandbox.');
			return;
		}

		const reqid = `${workerGlobals.activeCharacterId}//false//${generateAttrID()}`;
		workerGlobals.waitingAttrRequests[reqid] = callback;

		postMessage({
			type: 'deletecharmancerdata',
			data: pages,
			id: workerGlobals.activeCharacterId,
			reqid,
		});
	};

	self.changeCharmancerPage = function (page, callback) {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to change the Charactermancer slide no character is active in sandbox.');
			return;
		}

		if (!page) {
			console.log('You must specify a page to switch to.');
			return;
		}

		const reqid = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;
		if (callback) {
			workerGlobals.waitingAttrRequests[reqid] = callback;
		}

		postMessage({
			type: 'changecharmancerpage',
			data: page,
			id: workerGlobals.activeCharacterId,
			reqid,
		});
	};

	self.finishCharactermancer = function () {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to do finishCharactermancer when no character is active in sandbox.');
			return;
		}

		postMessage({
			type: 'finishcharactermancer',
			characterid: workerGlobals.activeCharacterId,
		});
	};

	// Sends a roll to the roll server, sends results back through the callback
	self.startRoll = (rollString, callback) => {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to submit a roll, but no character is active in sandbox.');
			return;
		}

		const reqid = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;

		postMessage({
			type: 'startroll',
			id: workerGlobals.activeCharacterId,
			rollString,
			reqid,
		});

		// if we have a callback, send results to it
		if (callback && typeof callback === 'function') workerGlobals.waitingAttrRequests[reqid] = callback;
		// otherwise, return a promise
		else {
			const prevCharacterId = workerGlobals.activeCharacterId;
			// eslint-disable-next-line consistent-return
			return new Promise((resolve) => {
				workerGlobals.waitingAttrRequests[reqid] = (values) => resolve(values);
			}).finally(() => {
				workerGlobals.activeCharacterId = prevCharacterId;
			});
		}
	};

	// Resolves a roll (started with the startRoll function)
	// with the data needed to post the roll to the chat
	self.finishRoll = (rollPromiseId, rollResults = {}) => {
		if (workerGlobals.activeCharacterId === false) {
			console.log('Character Sheet Error: Trying to submit a roll, but no character is active in sandbox.');
			return;
		}

		if (!rollPromiseId || typeof rollPromiseId !== 'string') {
			console.log('Finish roll requires a roll id.');
			return;
		}

		postMessage({
			type: 'finishroll',
			data: {
				rollPromiseId,
				rollResults,
			},
		});
	};
	
	self.populateListOptions = ({elemSelector, optionsArray, callback, overwrite = true}) => {
		if (workerGlobals.activeCharacterId === false) {
			console.error('Character Sheet populateListOptions Error: no character is active in sandbox.');
			return;
		}

		if (!Array.isArray(optionsArray)) {
			console.error('Character Sheet populateListOptions Error: no valid array of options');
			return;
		}

		const { hasErrors, message } = checkForValidKeys(optionsArray)

		if (hasErrors) {
			console.error(`Character Sheet populateListOptions Error: ${message}`);
			return;
		}

		const reqId = `${workerGlobals.activeCharacterId}//${generateAttrID()}`;

		postMessage({
			type: 'popListOptions',
			optionsArray,
			characterId: workerGlobals.activeCharacterId,
			elemSelector,
			overwrite,
			reqId,
		});

		if (callback && typeof callback === 'function') workerGlobals.waitingAttrRequests[reqId] = callback;		
	}

	console.log('Starting up WEB WORKER');

	const messageHandler = function (event) {
		const request = event.data;

		try {
			switch (request.type) {
				case 'preparePort':
					[port2] = event.ports;
					port2.onmessage = sandboxMessageHandler(workerGlobals);
					break;
				case 'eval':
					globalEval(request.data);
					break;
				case 'trigger':
					self.trigger(request.data);
					break;
				case 'attrreqfulfilled':
				case 'attrlistreqfulfilled':
				case 'setattrreqfulfilled':
				case 'getrollreqfulfilled':
					fullfillAttrReq(request.id, request.data);
					break;
				case 'setActiveCharacter':
					workerGlobals.activeCharacterId = request.data;
					break;
				case 'loadTranslationStrings':
					workerGlobals.translationStrings = request.data.values;
					workerGlobals.translationLanguage = request.data.lang;
					break;
				case 'getCompendiumPage':
					self.getCompendiumPage(request.id, request.data);
					break;
				case 'setCharmancerData':
					workerGlobals.charmancerData[request.character] = request.data;
					if (request.callback) {
						fullfillAttrReq(request.callback.id, request.callback.data);
					}
					break;
				default:
					break;
			}
		} catch (e) {
			console.log(e);
			console.log(e.stack);
		}

		delete self.input;
		if (self.onmessage) {
			delete self.onmessage; // in case the code defined it
		}
	};

	if (self.addEventListener) {
		self.addEventListener('message', messageHandler, false);
	} else if (self.attachEvent) { // for future compatibility with IE
		self.attachEvent('onmessage', messageHandler);
	}

	self.window = self; // provide a window object for scripts

	// dereference unsafe functions
	self.Worker = undefined;
	self.addEventListener = undefined;
	self.removeEventListener = undefined;
	self.importScripts = undefined;
	self.XMLHttpRequest = undefined;
	self.postMessage = undefined;
	self.attachEvent = undefined;
	self.detachEvent = undefined;
	self.ActiveXObject = undefined;
// eslint-disable-next-line no-undef
}(self, eval, _, generateUUID, jQueryShim));
