/**
 * @file src/templates/preset-manager.js
 * @description Preset manager for customizable NPC database templates, export/import, and built-in genre schemas.
 */

import classicPreset from './presets/classic.json' with { type: 'json' };
import sliceOfLifePreset from './presets/slice_of_life.json' with { type: 'json' };
import adventureFantasyPreset from './presets/adventure_fantasy.json' with { type: 'json' };
import rpgScifiPreset from './presets/rpg_scifi.json' with { type: 'json' };

/**
 * Deep freezes a preset object and its inner blocks for immutability.
 * @param {Object} p
 * @returns {Object}
 */
function freezePreset(p) {
    return Object.freeze({
        ...p,
        blocks: Object.freeze((p.blocks || []).map((b) => Object.freeze({ ...b }))),
    });
}

export const BUILTIN_PRESETS = Object.freeze([
    freezePreset(classicPreset),
    freezePreset(sliceOfLifePreset),
    freezePreset(adventureFantasyPreset),
    freezePreset(rpgScifiPreset),
]);

/**
 * Returns all presets, combining built-ins and user custom presets.
 * @param {Array<Object>} [customPresets=[]]
 * @returns {Array<Object>}
 */
export function getAllPresets(customPresets = []) {
    const list = [...BUILTIN_PRESETS];
    if (Array.isArray(customPresets)) {
        for (const cp of customPresets) {
            if (cp && cp.id && !list.some((p) => p.id === cp.id)) {
                list.push(cp);
            }
        }
    }
    return list;
}

/**
 * Finds a preset by ID, falling back to 'classic'.
 * @param {string} id
 * @param {Array<Object>} [customPresets=[]]
 * @returns {Object}
 */
export function getPresetById(id, customPresets = []) {
    const presets = getAllPresets(customPresets);
    return presets.find((p) => p.id === id) || presets[0];
}

/**
 * Generates an array of fresh, editable block objects for an NPC based on the given preset.
 * @param {Object} preset
 * @returns {Array<{ id: string, label: string, type: string, value: string }>}
 */
export function generateBlocksFromPreset(preset) {
    if (!preset || !Array.isArray(preset.blocks)) {
        return BUILTIN_PRESETS[0].blocks.map((b) => ({ ...b }));
    }
    return preset.blocks.map((b) => ({
        id: String(b.id || `custom_${Date.now()}`),
        label: String(b.label || b.id || 'Detail'),
        type: String(b.type || 'text'),
        value: typeof b.value === 'string' ? b.value : '',
    }));
}

/**
 * Validates an imported preset object. Throws an Error if invalid.
 * @param {Object} payload
 * @returns {Object} Cleaned, validated preset object.
 */
export function validatePreset(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Preset must be a valid JSON object.');
    }

    const name = String(payload.name || '').trim();
    if (!name) {
        throw new Error('Preset must have a non-empty "name".');
    }

    const id = String(payload.id || `preset_${Date.now()}`)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');

    if (!Array.isArray(payload.blocks) || payload.blocks.length === 0) {
        throw new Error('Preset must have a non-empty "blocks" array.');
    }

    const validatedBlocks = [];
    for (let i = 0; i < payload.blocks.length; i++) {
        const b = payload.blocks[i];
        if (!b || typeof b !== 'object') {
            throw new Error(`Invalid block at index ${i}: must be an object.`);
        }
        let blockId = String(b.id || `block_${i}`)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_');
        const DANGEROUS_KEYS = new Set(['constructor', '__proto__', 'prototype', 'tostring', 'valueof', 'isprototypeof']);
        if (DANGEROUS_KEYS.has(blockId)) {
            blockId = `block_${blockId}`;
        }
        const blockLabel = String(b.label || b.id || `Detail ${i + 1}`).trim();
        const blockType = typeof b.type === 'string' ? b.type : 'text';
        const blockValue = typeof b.value === 'string' ? b.value : '';

        validatedBlocks.push({
            id: blockId,
            label: blockLabel,
            type: blockType,
            value: blockValue,
        });
    }

    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    const template = typeof payload.template === 'string' ? payload.template.trim() : '';
    const extractionPrompt = typeof payload.extractionPrompt === 'string'
        ? payload.extractionPrompt.trim()
        : (typeof payload.extraction_prompt === 'string' ? payload.extraction_prompt.trim() : '');

    return {
        id,
        name,
        description,
        isBuiltin: false,
        blocks: validatedBlocks,
        template,
        extractionPrompt,
    };
}

/**
 * Exports a preset to a formatted JSON string.
 * @param {Object} preset
 * @returns {string}
 */
export function exportPresetJson(preset) {
    const clean = {
        version: 1,
        exported_at: new Date().toISOString(),
        id: preset.id,
        name: preset.name,
        description: preset.description || '',
        blocks: preset.blocks.map((b) => ({
            id: b.id,
            label: b.label,
            type: b.type || 'text',
            value: b.value || '',
        })),
        template: preset.template || '',
        extractionPrompt: preset.extractionPrompt || '',
    };
    return JSON.stringify(clean, null, 2);
}

/**
 * Parses and validates an imported JSON preset string.
 * @param {string} jsonString
 * @returns {Object} Validated preset object.
 */
export function importPresetFromJson(jsonString) {
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    } catch (err) {
        throw new Error(`Failed to parse preset JSON: ${err.message}`);
    }
    return validatePreset(parsed);
}
