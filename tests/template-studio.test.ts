import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAgentTemplateImport,
  applySkillTemplateImport,
  buildAgentArtifacts,
  buildTemplatePackDownload,
  createAgentTemplateForm,
  createSkillTemplateForm,
} from '../src/lib/template-studio.ts'

test('agent template pack import restores saved questionnaire snapshots', () => {
  const form = createAgentTemplateForm('architect')
  form.name = 'Architecture Captain'
  form.owner = 'platform-core'
  form.purpose = '把复杂需求拆成稳定的系统边界与交付路径。'
  form.allowedTools = 'docs_retriever\nsystem_mapper'
  form.handoffs = 'builder: 设计已收敛，需要进入实现阶段'

  const artifacts = buildAgentArtifacts(form)
  const pack = buildTemplatePackDownload('agent', form, artifacts, '2026-03-25T10:00:00.000Z')

  const imported = applyAgentTemplateImport(pack.fileName, pack.content, createAgentTemplateForm('planner'))

  assert.equal(imported.form.name, form.name)
  assert.equal(imported.form.owner, form.owner)
  assert.equal(imported.form.purpose, form.purpose)
  assert.equal(imported.form.allowedTools, form.allowedTools)
  assert.equal(imported.form.handoffs, form.handoffs)
  assert.match(imported.notice, /restored the saved agent questionnaire snapshot/i)
})

test('template pack download normalizes ids and keeps pack metadata stable', () => {
  const form = createSkillTemplateForm('write-prd')
  form.id = '  Release Notes ++  '
  form.name = 'Release Notes'
  form.version = '2.4.0'
  const artifacts = [
    {
      path: 'skills/release-notes/SKILL.md',
      label: 'SKILL.md',
      description: 'Skill contract',
      content: '# Release Notes',
    },
  ]

  const pack = buildTemplatePackDownload('skill', form, artifacts, '2026-03-25T12:00:00.000Z')

  assert.equal(pack.fileName, 'release-notes.pack.json')
  assert.equal(pack.payload.id, 'release-notes')
  assert.equal(pack.payload.kind, 'skill')
  assert.equal(pack.payload.name, 'Release Notes')
  assert.equal(pack.payload.version, '2.4.0')
  assert.equal(pack.payload.generatedAt, '2026-03-25T12:00:00.000Z')
  assert.deepEqual(pack.payload.files, artifacts)
})

test('rtf import preserves unicode content for questionnaire parsing', () => {
  const rtf = String.raw`{\rtf1\ansi # Purpose\par \u39033?\u30446?\u35268?\u21010?\par }`
  const imported = applyAgentTemplateImport('agent-template.rtf', rtf, createAgentTemplateForm('planner'))

  assert.match(imported.normalizedText, /项目规划/)
  assert.equal(imported.form.purpose, '项目规划')
})

test('skill json import maps structured fields into the questionnaire', () => {
  const source = JSON.stringify({
    skill: {
      id: 'release-note-skill',
      name: 'Release Note Skill',
    },
    owner: 'product-ops',
    purpose: 'Convert changelog items into a concise release note.',
    whenToUse: ['weekly release', 'launch recap'],
    outputSchemaFields: ['title:string*', 'summary:string*'],
  })

  const imported = applySkillTemplateImport('release-note.json', source, createSkillTemplateForm('write-prd'))

  assert.equal(imported.form.id, 'release-note-skill')
  assert.equal(imported.form.name, 'Release Note Skill')
  assert.equal(imported.form.owner, 'product-ops')
  assert.equal(imported.form.purpose, 'Convert changelog items into a concise release note.')
  assert.equal(imported.form.whenToUse, 'weekly release\nlaunch recap')
  assert.equal(imported.form.outputSchemaFields, 'title:string*\nsummary:string*')
})
