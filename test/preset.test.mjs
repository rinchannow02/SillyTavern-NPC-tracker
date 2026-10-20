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

test('preset schemas - all built-ins include speech_style and bio, slice_of_life excludes routine', () => {
    const sol = getPresetById('slice_of_life');
    const solBlockIds = sol.blocks.map((b) => b.id);
    assert.ok(solBlockIds.includes('occupation'));
    assert.ok(solBlockIds.includes('personality'));
    assert.ok(solBlockIds.includes('speech_style'));
    assert.ok(solBlockIds.includes('quirks'));
    assert.ok(solBlockIds.includes('relationship'));
    assert.ok(solBlockIds.includes('bio'));
    assert.ok(!solBlockIds.includes('routine'), 'routine should be removed from slice_of_life');

    for (const preset of BUILTIN_PRESETS) {
        const ids = preset.blocks.map((b) => b.id);
        assert.ok(ids.includes('speech_style'), `${preset.id} missing speech_style`);
        assert.ok(ids.includes('bio'), `${preset.id} missing bio`);
        assert.ok(preset.template.includes('{{speech_style}}'), `${preset.id} template missing speech_style token`);
        assert.ok(preset.template.includes('{{bio}}'), `${preset.id} template missing bio token`);
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
