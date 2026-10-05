/**
 * Renderer/Entity/EntityAura.js
 *
 * Helper to manage entity's aura
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Gulfaraz Rahman
 *
 * @typedef {Object} TMapPreferencesAura
 * @prop {number} aura - 0: no aura, 1: only aura, 2: aura and aura2
 *
 * @typedef {Object} TAuraSettings - aura settings, the server's `aura` config over the defaults (AuraTiers.js)
 * @prop {number} defaultLv - level of the first aura (99)
 * @prop {number} lv150 - level of the 150 tier
 * @prop {number} lv160 - level of the 160/185 tier
 * @prop {number} fourthLv - level of a 4th job's gold aura (250)
 * @prop {boolean} upperJob - transcendent second jobs wear the 185 tier from defaultLv
 * @prop {number[]} color - [r, g, b] 0-255 for every tier
 * @prop {object} colors - [r, g, b] by tier (99, 150, 185, fourth)
 */

import /** @type {TMapPreferencesAura} */ MapPreferences from 'Preferences/Map.js';
import Configs from 'Core/Configs.js';
import { TIER_EFFECTS, ALL_TIER_EFFECTS, auraSettings, auraTier, tierColor } from 'DB/Effects/AuraTiers.js';

/**
 * Aura class — the level aura a character wears: the level-99 one, and the
 * tiers past it (DB/Effects/AuraTiers.js says which, by level and job).
 *
 * @class Aura
 * @property {boolean} isLoaded Whether aura effect is currently loaded
 * @property {Entity} entity Attached entity reference
 * @property {number} lastAuraState Saved preference state to track /aura toggle changes
 * @property {string|null} loadedKey The tier, preference and colour last loaded
 */
class Aura {
	constructor(entity) {
		this.isLoaded = false; // to avoid duplicate aura effects
		this.entity = entity; // reference to attached entity
		this.lastAuraState = 0; // save last aura state to track changes on aura/aura2 command
		this.loadedKey = null;
	}

	/**
	 * Show aura
	 */
	load(effectManager) {
		const server = Configs.getServer(); // find aura from servers config
		/** @type {TAuraSettings} - server aura config over the defaults */
		const settings = auraSettings(server != null ? server.aura : undefined);
		const job = this.entity._job !== undefined ? this.entity._job : this.entity.job;
		const tier = MapPreferences.aura > 0 ? auraTier(this.entity.clevel, job, settings) : null;

		if (tier === null || !this.entity.isVisible()) {
			// does not qualify, /aura is off, or the entity is not visible
			if (this.isLoaded) {
				this.remove(effectManager);
			}
			this.lastAuraState = MapPreferences.aura;
			return;
		}

		// The level-99 aura keeps its own colours unless the server sets one.
		const color =
			tier === 99 && !settings.color && !(settings.colors && settings.colors[99])
				? null
				: tierColor(tier, settings);
		const key = `${tier}:${MapPreferences.aura}:${color ? [color.r, color.g, color.b].join(',') : ''}`;
		if (this.isLoaded && this.loadedKey === key) {
			return;
		}
		// A level-up into the next tier, /aura toggled, or another colour.
		if (this.isLoaded) {
			this.remove(effectManager);
		}

		// /aura 1 is the simple aura, /aura 2 the whole of it
		const effects = MapPreferences.aura < 2 ? TIER_EFFECTS[tier].simple : TIER_EFFECTS[tier].full;
		for (let i = 0; i < effects.length; i++) {
			effectManager.spam({
				ownerAID: this.entity.GID,
				position: this.entity.position,
				effectId: effects[i],
				auraColor: color || undefined
			});
		}
		this.isLoaded = true;
		this.loadedKey = key;
		this.lastAuraState = MapPreferences.aura;
	}

	/**
	 * Hide aura
	 */
	remove(effectManager) {
		// remove whichever tier's effects were showing
		effectManager.remove(null, this.entity.GID, ALL_TIER_EFFECTS);
		// free aura - needs to be separate to avoid circular dependency
		this.free();
	}

	/**
	 * Hide aura
	 */
	free() {
		// reset flag to allow aura to be loaded
		this.isLoaded = false;
		this.loadedKey = null;
	}
}
/**
 * Export
 */
export default function init() {
	this.aura = new Aura(this);
}
