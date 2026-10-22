import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BUILTIN_PRESETS,
    getAllPresets,
    getPresetById,
    generateBlocksFromPreset,
    validatePreset,
    exportPresetJson,
    importPresetFromJson,
} from '../src/templates/preset-manager.js';

test('BUILTIN_PRESETS - includes 4 complete built-in presets', () => {
    assert.equal(BUILTIN_PRESETS.length, 4);
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    assert.ok(ids.includes('classic'));
    assert.ok(ids.includes('slice_of_life'));
    assert.ok(ids.includes('adventure_fantasy'));
    assert.ok(ids.includes('rpg_scifi'));

    for (const preset of BUILTIN_PRESETS) {
        assert.ok(preset.name);
        assert.ok(preset.description);
        assert.ok(Array.isArray(preset.blocks));
        assert.ok(preset.blocks.length >= 3);
        assert.ok(preset.template);
        assert.ok(preset.extractionPrompt);
    }
});

test('getAllPresets - merges custom presets with built-ins', () => {
    const custom = [
        {
            id: 'mystery_noir',
            name: 'Mystery & Noir',
            blocks: [{ id: 'clues', label: 'Clues & Secrets', type: 'text' }],
        },
    ];
    const all = getAllPresets(custom);
    assert.equal(all.length, 5);
    assert.equal(all[4].id, 'mystery_noir');
});

test('getPresetById - falls back to classic if not found', () => {
    const p = getPresetById('non_existent_preset');
    assert.equal(p.id, 'classic');
});

test('generateBlocksFromPreset - returns fresh mutable block copies', () => {
    const preset = getPresetById('slice_of_life');
    const blocks = generateBlocksFromPreset(preset);
    assert.equal(blocks.length, preset.blocks.length);
    assert.equal(blocks[0].id, 'occupation');

    // Mutating returned block does not affect preset
    blocks[0].value = 'Detective';
    assert.equal(preset.blocks[0].value, '');
});

test('exportPresetJson & importPresetFromJson - round-trip serialization', () => {
    const custom = {
        id: 'superhero',
        name: 'Superhero & Villains',
        description: 'Track powers, secret identity, and hero rankings.',
        blocks: [
            { id: 'powers', label: 'Superpowers', type: 'text' },
            { id: 'identity', label: 'Secret Identity', type: 'text' },
        ],
        template: '### {{name}}\n- Powers: {{powers}}\n- Identity: {{identity}}',
        extractionPrompt: 'Extract superhero powers and identities.',
    };

    const json = exportPresetJson(custom);
    assert.ok(typeof json === 'string');

    const imported = importPresetFromJson(json);
    assert.equal(imported.id, 'superhero');
    assert.equal(imported.name, 'Superhero & Villains');
    assert.equal(imported.blocks.length, 2);
    assert.equal(imported.blocks[0].label, 'Superpowers');
    assert.equal(imported.template, custom.template);
});

test('validatePreset - rejects invalid payloads', () => {
    assert.throws(() => validatePreset(null), /must be a valid JSON object/);
    assert.throws(() => validatePreset({}), /must have a non-empty "name"/);
    assert.throws(() => validatePreset({ name: 'Bad' }), /must have a non-empty "blocks" array/);
    assert.throws(() => validatePreset({ name: 'Bad', blocks: ['not an object'] }), /Invalid block at index 0/);
});

test('preset schemas - all built-ins include appearance, relationship, speech_style and bio', () => {
    const sol = getPresetById('slice_of_life');
    const solBlockIds = sol.blocks.map((b) => b.id);
    assert.ok(solBlockIds.includes('occupation'));
    assert.ok(solBlockIds.includes('appearance'));
    assert.ok(solBlockIds.includes('personality'));
    assert.ok(solBlockIds.includes('speech_style'));
    assert.ok(solBlockIds.includes('quirks'));
    assert.ok(solBlockIds.includes('relationship'));
    assert.ok(solBlockIds.includes('bio'));
    assert.ok(!solBlockIds.includes('routine'), 'routine should be removed from slice_of_life');

    for (const preset of BUILTIN_PRESETS) {
        const ids = preset.blocks.map((b) => b.id);
        assert.ok(ids.includes('appearance'), `${preset.id} missing appearance`);
        assert.ok(ids.includes('relationship'), `${preset.id} missing relationship`);
        assert.ok(ids.includes('speech_style'), `${preset.id} missing speech_style`);
        assert.ok(ids.includes('bio'), `${preset.id} missing bio`);
        assert.ok(preset.template.includes('{{appearance}}'), `${preset.id} template missing appearance token`);
        assert.ok(preset.template.includes('{{relationship}}'), `${preset.id} template missing relationship token`);
        assert.ok(preset.template.includes('{{speech_style}}'), `${preset.id} template missing speech_style token`);
        assert.ok(preset.template.includes('{{bio}}'), `${preset.id} template missing bio token`);
        assert.ok(preset.extractionPrompt.includes('appearance'), `${preset.id} prompt missing appearance key`);
        assert.ok(preset.extractionPrompt.includes('relationship'), `${preset.id} prompt missing relationship key`);
        assert.ok(preset.extractionPrompt.includes('speech_style'), `${preset.id} prompt missing speech_style key`);
        assert.ok(preset.extractionPrompt.includes('bio'), `${preset.id} prompt missing bio key`);
    }
});

test('validatePreset - sanitizes dangerous prototype block IDs (C3)', () => {
    const malicious = {
        name: 'Exploit Preset',
        blocks: [
            { id: 'constructor', label: 'Constructor', type: 'text' },
            { id: '__proto__', label: 'Proto', type: 'text' },
            { id: 'normal', label: 'Normal', type: 'text' },
        ],
    };
    const validated = validatePreset(malicious);
    assert.equal(validated.blocks[0].id, 'block_constructor');
    assert.equal(validated.blocks[1].id, 'block___proto__');
    assert.equal(validated.blocks[2].id, 'normal');
});

test('individual preset JSON files - exist in presets directory and match valid schemas', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const presetFiles = ['classic.json', 'slice_of_life.json', 'adventure_fantasy.json', 'rpg_scifi.json'];
    for (const filename of presetFiles) {
        const filePath = path.resolve('src/templates/presets', filename);
        assert.ok(fs.existsSync(filePath), `Preset file ${filename} must exist`);

        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const validated = validatePreset(parsed);

        assert.ok(validated.id);
        assert.ok(validated.name);
        assert.ok(Array.isArray(validated.blocks) && validated.blocks.length >= 3);
        assert.ok(validated.template);
        assert.ok(validated.extractionPrompt);
    }
});

test('chat-scanner salvage engine - formatKeyToLabel and normalizeKey handle snake_case and camelCase keys', async () => {
    const { formatKeyToLabel, normalizeKey } = await import('../src/scanner/chat-scanner.js');

    assert.equal(formatKeyToLabel('quest_hooks'), 'Quest Hooks');
    assert.equal(formatKeyToLabel('combatStyle'), 'Combat Style');
    assert.equal(formatKeyToLabel('custom_secret_weapon'), 'Secret Weapon');
    assert.equal(formatKeyToLabel('weapons'), 'Weapons');
    assert.equal(formatKeyToLabel(''), 'Detail');

    assert.equal(normalizeKey('Speech_Style'), 'speechstyle');
    assert.equal(normalizeKey('Tone & Speaking Style'), 'tonespeakingstyle');
    assert.equal(normalizeKey('relationship_summary'), 'relationshipsummary');
});


