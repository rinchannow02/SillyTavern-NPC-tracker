/**
 * @file src/templates/preset-manager.js
 * @description Preset manager for customizable NPC database templates, export/import, and built-in genre schemas.
 */

export const BUILTIN_PRESETS = Object.freeze([
    Object.freeze({
        id: 'classic',
        name: 'Classic (Standard)',
        description: 'Standard character tracking for general roleplay (Appearance, Personality, Speaking Style, Relationship, Bio).',
        isBuiltin: true,
        blocks: Object.freeze([
            Object.freeze({ id: 'appearance', label: 'Appearance', type: 'text', value: '' }),
            Object.freeze({ id: 'personality', label: 'Personality', type: 'text', value: '' }),
            Object.freeze({ id: 'speech_style', label: 'Tone & Speaking Style', type: 'text', value: '' }),
            Object.freeze({ id: 'relationship', label: 'Relationship', type: 'text', value: '' }),
            Object.freeze({ id: 'bio', label: 'Short Bio & Background', type: 'text', value: '' }),
        ]),
        template: '### NPC: {{name}} [{{group}}]\n- **Appearance:** {{appearance}}\n- **Personality:** {{personality}}\n- **Speaking Style:** {{speech_style}}\n- **Relationship:** {{relationship}}\n- **Bio:** {{bio}}',
        extractionPrompt: `Extract newly introduced or updated secondary/tertiary NPCs from the recent roleplay messages.
Do NOT extract the main user persona or the primary character.
Only account for NPCs that regularly appear or actively interact in the story.

For each NPC found, output a JSON array of objects with the following keys:
- "name": string (Full or recognized name of the NPC)
- "aliases": string (Comma-separated nicknames, titles, or aliases, or empty string)
- "group_name": string (Faction, department, or establishment, or empty string)
- "location_keywords": string (Comma-separated setting keywords where this NPC appears, or empty string)
- "appearance": string (Concise physical traits and attire)
- "personality": string (Concise behavioral tags or demeanor)
- "speech_style": string (Tone of voice, speech patterns, verbal mannerisms, or accent for the LLM to roleplay)
- "relationship": string (Pairwise relationship notes, e.g. "Friend, Guard Captain")
- "bio": string (Short background, backstory, or notable context up to ~200 words)

Output ONLY the valid JSON array inside a \`\`\`json\`\`\` code block without preamble or explanation.`,
    }),
    Object.freeze({
        id: 'slice_of_life',
        name: 'Slice of Life',
        description: 'Tailored for contemporary, school, workplace, and slice-of-life roleplay.',
        isBuiltin: true,
        blocks: Object.freeze([
            Object.freeze({ id: 'occupation', label: 'Occupation / Role', type: 'text', value: '' }),
            Object.freeze({ id: 'personality', label: 'Personality & Demeanor', type: 'text', value: '' }),
            Object.freeze({ id: 'speech_style', label: 'Tone & Speaking Style', type: 'text', value: '' }),
            Object.freeze({ id: 'quirks', label: 'Habits & Quirks', type: 'text', value: '' }),
            Object.freeze({ id: 'relationship', label: 'Relationship to You', type: 'text', value: '' }),
            Object.freeze({ id: 'bio', label: 'Short Bio & Background', type: 'text', value: '' }),
        ]),
        template: '### NPC: {{name}} ({{aliases}}) [{{group}}]\n- **Occupation:** {{occupation}}\n- **Personality:** {{personality}}\n- **Speaking Style:** {{speech_style}}\n- **Habits & Quirks:** {{quirks}}\n- **Relationship:** {{relationship}}\n- **Bio:** {{bio}}',
        extractionPrompt: `Extract newly introduced or updated secondary/tertiary NPCs from the recent roleplay messages.
Do NOT extract the main user persona or the primary character.
Focus on characters that live and interact in the everyday world.

For each NPC found, output a JSON array of objects with the following keys:
- "name": string (Full name of the NPC)
- "aliases": string (Nicknames, titles, or pet names)
- "group_name": string (School, workplace, club, or social circle)
- "location_keywords": string (Common hangouts, e.g. "cafe, classroom, park")
- "occupation": string (Job, school grade, or social role)
- "personality": string (Demeanor, attitude, and social style)
- "speech_style": string (Tone of voice, speech patterns, slang, or verbal mannerisms for the LLM to roleplay)
- "quirks": string (Notable habits, mannerisms, or speech idiosyncrasies)
- "relationship": string (Connection to player or primary characters)
- "bio": string (Short backstory, daily life background, or history up to ~200 words)

Output ONLY the valid JSON array inside a \`\`\`json\`\`\` code block without preamble or explanation.`,
    }),
    Object.freeze({
        id: 'adventure_fantasy',
        name: 'Adventure & Fantasy',
        description: 'Designed for high fantasy, adventuring parties, tavern questing, and guild campaigns.',
        isBuiltin: true,
        blocks: Object.freeze([
            Object.freeze({ id: 'role_class', label: 'Race & Class', type: 'text', value: '' }),
            Object.freeze({ id: 'appearance', label: 'Appearance & Armor', type: 'text', value: '' }),
            Object.freeze({ id: 'personality', label: 'Demeanor & Alignment', type: 'text', value: '' }),
            Object.freeze({ id: 'speech_style', label: 'Speaking Style & Dialect', type: 'text', value: '' }),
            Object.freeze({ id: 'equipment', label: 'Weapons & Gear', type: 'text', value: '' }),
            Object.freeze({ id: 'quest_hooks', label: 'Quest Hooks & Motives', type: 'text', value: '' }),
            Object.freeze({ id: 'bio', label: 'Short Bio & Lore', type: 'text', value: '' }),
        ]),
        template: '### NPC: {{name}} [{{group}}]\n- **Race & Class:** {{role_class}}\n- **Appearance & Armor:** {{appearance}}\n- **Demeanor:** {{personality}}\n- **Speaking Style:** {{speech_style}}\n- **Weapons & Gear:** {{equipment}}\n- **Quest Hooks:** {{quest_hooks}}\n- **Bio:** {{bio}}',
        extractionPrompt: `Extract newly introduced or updated secondary/tertiary NPCs from the recent fantasy roleplay messages.
Do NOT extract the main user persona or the primary character.

For each NPC found, output a JSON array of objects with the following keys:
- "name": string (Full name or adventurer title)
- "aliases": string (Aliases, monikers, e.g. "The Silver Fox")
- "group_name": string (Guild, covenant, mercenary band, or village)
- "location_keywords": string (Tavern, dungeon floor, forest grove, fortress)
- "role_class": string (Race and adventurer class/profession, e.g. "Elf Ranger", "Dwarf Blacksmith")
- "appearance": string (Armor, physical build, distinguishing scars or features)
- "personality": string (Demeanor, moral alignment, and temperament)
- "speech_style": string (Accent, archaic dialect, cadence, or manner of speech)
- "equipment": string (Signature weapons, enchanted artifacts, or gear)
- "quest_hooks": string (Secrets, bounties, requests, or motivations)
- "bio": string (Short origin, backstory, or notable deeds up to ~200 words)

Output ONLY the valid JSON array inside a \`\`\`json\`\`\` code block without preamble or explanation.`,
    }),
    Object.freeze({
        id: 'rpg_scifi',
        name: 'RPG & Cyberpunk',
        description: 'Structured for gritty sci-fi, cyberpunk, corporations, and faction-based RPGs.',
        isBuiltin: true,
        blocks: Object.freeze([
            Object.freeze({ id: 'faction_role', label: 'Faction & Role', type: 'text', value: '' }),
            Object.freeze({ id: 'cyberware_gear', label: 'Cyberware & Tech', type: 'text', value: '' }),
            Object.freeze({ id: 'personality', label: 'Attitude & Motive', type: 'text', value: '' }),
            Object.freeze({ id: 'speech_style', label: 'Street Slang & Demeanor', type: 'text', value: '' }),
            Object.freeze({ id: 'threat_bounty', label: 'Threat Level & Bounty', type: 'text', value: '' }),
            Object.freeze({ id: 'relationship', label: 'Street Standing', type: 'text', value: '' }),
            Object.freeze({ id: 'bio', label: 'Short Bio & Dossier', type: 'text', value: '' }),
        ]),
        template: '### NPC: {{name}} [{{group}}]\n- **Faction & Role:** {{faction_role}}\n- **Cyberware & Gear:** {{cyberware_gear}}\n- **Attitude:** {{personality}}\n- **Speech Style:** {{speech_style}}\n- **Threat Level:** {{threat_bounty}}\n- **Standing:** {{relationship}}\n- **Bio:** {{bio}}',
        extractionPrompt: `Extract newly introduced or updated secondary/tertiary NPCs from the recent sci-fi/cyberpunk roleplay messages.
Do NOT extract the main user persona or the primary character.

For each NPC found, output a JSON array of objects with the following keys:
- "name": string (Street handle or full name)
- "aliases": string (Callsigns, street tags, or corporate titles)
- "group_name": string (Megacorp, street gang, fixers, or syndicate)
- "location_keywords": string (District, safehouse, dive bar, cyberspace)
- "faction_role": string (Specialty, e.g. "Netrunner, Fixer, Corp Security Exec")
- "cyberware_gear": string (Visible cybernetics, high-tech weapon loadout)
- "personality": string (Street attitude, vices, and hidden motives)
- "speech_style": string (Street slang, corporate jargon, or verbal cadence for roleplay)
- "threat_bounty": string (Combat danger rating, active bounties, or law enforcement status)
- "relationship": string (Affiliation or street cred with the player)
- "bio": string (Brief dossier history, criminal record, or origin up to ~200 words)

Output ONLY the valid JSON array inside a \`\`\`json\`\`\` code block without preamble or explanation.`,
    }),
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
