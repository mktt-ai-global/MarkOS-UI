import { type ReactNode, useMemo, useState } from 'react'
import { Copy, Download, FileUp, Layers3, Sparkles } from 'lucide-react'
import GlassCard from './GlassCard'
import type { AgentInfo, SkillInfo } from '../lib/mock-data'
import { copyTextToClipboard } from '../lib/clipboard'
import {
  agentTemplatePresets,
  applyAgentTemplateImport,
  applySkillTemplateImport,
  buildAgentArtifacts,
  buildAgentDraft,
  buildTemplatePackDownload,
  buildSkillArtifacts,
  buildSkillDraft,
  createAgentTemplateForm,
  createSkillTemplateForm,
  skillTemplatePresets,
  type AgentTemplateForm,
  type SkillTemplateForm,
} from '../lib/template-studio'

type StudioMode = 'agent' | 'skill'
type EntryMode = 'questionnaire' | 'import'

interface TemplateStudioProps {
  mode: StudioMode
  initialAgentForm?: AgentTemplateForm
  initialSkillForm?: SkillTemplateForm
  submitLabel?: string
  onCreateAgentDraft?: (draft: AgentInfo, form: AgentTemplateForm) => void
  onCreateSkillDraft?: (draft: SkillInfo, form: SkillTemplateForm) => void
}

interface InputFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  help?: string
}

interface TextAreaFieldProps extends InputFieldProps {
  rows?: number
}

function InputField({ label, value, onChange, placeholder, help, error }: InputFieldProps & { error?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-text-primary block mb-1.5">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full glass-input rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/20 ${error ? 'ring-2 ring-danger/30' : ''}`}
      />
      {error && <span className="text-[10px] text-danger mt-1 block">{error}</span>}
      {help && !error && <span className="text-[10px] text-text-tertiary mt-1 block">{help}</span>}
    </label>
  )
}

function TextAreaField({ label, value, onChange, placeholder, help, rows = 4 }: TextAreaFieldProps) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-text-primary block mb-1.5">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full glass-input rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/20 resize-y"
      />
      {help && <span className="text-[10px] text-text-tertiary mt-1 block">{help}</span>}
    </label>
  )
}

function FieldSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="glass-subtle rounded-2xl p-4 space-y-3">
      <div>
        <div className="text-xs font-semibold text-text-primary">{title}</div>
        <div className="text-[10px] text-text-tertiary mt-0.5">{subtitle}</div>
      </div>
      {children}
    </div>
  )
}

export default function TemplateStudio({
  mode,
  initialAgentForm,
  initialSkillForm,
  submitLabel,
  onCreateAgentDraft,
  onCreateSkillDraft,
}: TemplateStudioProps) {
  const [entryMode, setEntryMode] = useState<EntryMode>('questionnaire')
  const [selectedPreset, setSelectedPreset] = useState(
    mode === 'agent'
      ? initialAgentForm?.id || 'planner'
      : initialSkillForm?.id || 'write-prd',
  )
  const [importFileName, setImportFileName] = useState('')
  const [importSourceText, setImportSourceText] = useState('')
  const [studioMessage, setStudioMessage] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [selectedArtifactPath, setSelectedArtifactPath] = useState('')
  const [agentForm, setAgentForm] = useState<AgentTemplateForm>(() => initialAgentForm || createAgentTemplateForm('planner'))
  const [skillForm, setSkillForm] = useState<SkillTemplateForm>(() => initialSkillForm || createSkillTemplateForm('write-prd'))

  const artifacts = useMemo(
    () => (mode === 'agent' ? buildAgentArtifacts(agentForm) : buildSkillArtifacts(skillForm)),
    [mode, agentForm, skillForm],
  )
  const resolvedSelectedArtifactPath = artifacts.some((artifact) => artifact.path === selectedArtifactPath)
    ? selectedArtifactPath
    : artifacts[0]?.path || ''
  const selectedArtifact = artifacts.find((artifact) => artifact.path === resolvedSelectedArtifactPath) || artifacts[0]
  const submitButtonLabel = submitLabel || 'Save Local Template'

  const updateAgentField = <T extends keyof AgentTemplateForm>(field: T, value: AgentTemplateForm[T]) => {
    setAgentForm((current) => ({ ...current, [field]: value }))
  }

  const updateSkillField = <T extends keyof SkillTemplateForm>(field: T, value: SkillTemplateForm[T]) => {
    setSkillForm((current) => ({ ...current, [field]: value }))
  }

  const handleApplyPreset = (presetId: string) => {
    setSelectedPreset(presetId)
    setStudioMessage(null)
    setImportFileName('')
    setImportSourceText('')

    if (mode === 'agent') {
      setAgentForm(createAgentTemplateForm(presetId))
    } else {
      setSkillForm(createSkillTemplateForm(presetId))
    }
  }

  const handleImportFile = async (file: File | null) => {
    if (!file) return

    const source = await file.text()
    setImportFileName(file.name)
    setEntryMode('import')

    if (mode === 'agent') {
      const result = applyAgentTemplateImport(file.name, source, agentForm)
      setAgentForm(result.form)
      setImportSourceText(result.normalizedText)
      setStudioMessage(result.notice)
    } else {
      const result = applySkillTemplateImport(file.name, source, skillForm)
      setSkillForm(result.form)
      setImportSourceText(result.normalizedText)
      setStudioMessage(result.notice)
    }
  }

  const handleCopySelected = () => {
    if (!selectedArtifact) return

    void copyTextToClipboard(selectedArtifact.content).then((didCopy) => {
      setStudioMessage(
        didCopy
          ? `Copied ${selectedArtifact.label} to clipboard.`
          : 'Clipboard access is unavailable in this browser context.',
      )
    })
  }

  const downloadArtifact = (label: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = label
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadSelected = () => {
    if (!selectedArtifact) return

    downloadArtifact(selectedArtifact.label, selectedArtifact.content)
    setStudioMessage(`Downloaded ${selectedArtifact.label}.`)
  }

  const handleDownloadPack = () => {
    const pack = mode === 'agent'
      ? buildTemplatePackDownload('agent', agentForm, artifacts)
      : buildTemplatePackDownload('skill', skillForm, artifacts)

    downloadArtifact(pack.fileName, pack.content)
    setStudioMessage(`Downloaded a single artifact pack with ${artifacts.length} generated files.`)
  }

  const handleCreateLocalDraft = () => {
    const errors: Record<string, string> = {}

    if (mode === 'agent') {
      if (!agentForm.id.trim()) errors.id = 'Agent ID is required.'
      if (!agentForm.name.trim()) errors.name = 'Agent Name is required.'
    } else {
      if (!skillForm.id.trim()) errors.id = 'Skill ID is required.'
      if (!skillForm.name.trim()) errors.name = 'Skill Name is required.'
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setStudioMessage('Please fill in all required fields before saving.')
      return
    }

    setValidationErrors({})

    if (mode === 'agent') {
      const draft = buildAgentDraft(agentForm)
      onCreateAgentDraft?.(draft, agentForm)
      setStudioMessage(`Saved local agent template "${draft.name}".`)
      return
    }

    const draft = buildSkillDraft(skillForm)
    onCreateSkillDraft?.(draft, skillForm)
    setStudioMessage(`Saved local skill template "${draft.name}".`)
  }

  const renderAgentQuestionnaire = () => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <FieldSection title="Identity" subtitle="基础身份、角色边界和工程元数据">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputField label="Agent ID" value={agentForm.id} onChange={(value) => updateAgentField('id', value)} placeholder="planner" error={validationErrors.id} />
          <InputField label="Agent Name" value={agentForm.name} onChange={(value) => updateAgentField('name', value)} placeholder="Planning Agent" error={validationErrors.name} />
          <InputField label="Owner" value={agentForm.owner} onChange={(value) => updateAgentField('owner', value)} placeholder="core-ai-team" />
          <InputField label="Version" value={agentForm.version} onChange={(value) => updateAgentField('version', value)} placeholder="1.0.0" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-text-primary block mb-1.5">Type</span>
            <select value={agentForm.type} onChange={(event) => updateAgentField('type', event.target.value)} className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent">
              <option value="orchestrator">orchestrator</option>
              <option value="specialist">specialist</option>
              <option value="reviewer">reviewer</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-text-primary block mb-1.5">Status</span>
            <select value={agentForm.status} onChange={(event) => updateAgentField('status', event.target.value)} className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent">
              <option value="active">active</option>
              <option value="draft">draft</option>
              <option value="paused">paused</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-text-primary block mb-1.5">Priority</span>
            <select value={agentForm.priority} onChange={(event) => updateAgentField('priority', event.target.value)} className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent">
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </label>
        </div>
        <TextAreaField label="Purpose" value={agentForm.purpose} onChange={(value) => updateAgentField('purpose', value)} rows={3} />
        <TextAreaField label="Mission" value={agentForm.mission} onChange={(value) => updateAgentField('mission', value)} rows={3} help="会自动进入 system.prompt.md 的 Mission 区块。" />
      </FieldSection>

      <FieldSection title="Behavior" subtitle="职责、边界、输入输出和质量要求">
        <TextAreaField label="Responsibilities" value={agentForm.responsibilities} onChange={(value) => updateAgentField('responsibilities', value)} help="每行一项。" />
        <TextAreaField label="Non-Responsibilities" value={agentForm.nonResponsibilities} onChange={(value) => updateAgentField('nonResponsibilities', value)} help="每行一项。" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextAreaField label="Inputs" value={agentForm.inputs} onChange={(value) => updateAgentField('inputs', value)} help="每行一个输入。" />
          <TextAreaField label="Outputs" value={agentForm.outputs} onChange={(value) => updateAgentField('outputs', value)} help="每行一个输出。" />
        </div>
        <TextAreaField label="Success Criteria" value={agentForm.successCriteria} onChange={(value) => updateAgentField('successCriteria', value)} help="每行一项成功标准。" />
        <TextAreaField label="Failure Modes" value={agentForm.failureModes} onChange={(value) => updateAgentField('failureModes', value)} help="每行一种失败模式。" />
      </FieldSection>

      <FieldSection title="Contracts" subtitle="工具、技能、交接规则与护栏">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextAreaField label="Allowed Tools" value={agentForm.allowedTools} onChange={(value) => updateAgentField('allowedTools', value)} help="每行一个 tool id。" />
          <TextAreaField label="Allowed Skills" value={agentForm.allowedSkills} onChange={(value) => updateAgentField('allowedSkills', value)} help="每行一个 skill id。" />
        </div>
        <TextAreaField label="Handoffs" value={agentForm.handoffs} onChange={(value) => updateAgentField('handoffs', value)} help="格式：target: 交接条件。每行一条。" />
        <TextAreaField label="Guardrails" value={agentForm.guardrails} onChange={(value) => updateAgentField('guardrails', value)} help="每行一条硬约束。" />
        <TextAreaField label="Tool Policies" value={agentForm.toolPolicies} onChange={(value) => updateAgentField('toolPolicies', value)} help="用于 tools.yaml 的 policies。" />
      </FieldSection>

      <FieldSection title="Observability & Schemas" subtitle="日志项、prompt 质量条和结构化 schema 字段">
        <TextAreaField label="Observability" value={agentForm.observability} onChange={(value) => updateAgentField('observability', value)} help="每行一个日志项。" />
        <TextAreaField label="Quality Bar" value={agentForm.qualityBar} onChange={(value) => updateAgentField('qualityBar', value)} help="system.prompt.md 的质量基线，每行一项。" />
        <TextAreaField label="Recovery Rules" value={agentForm.recoveryRules} onChange={(value) => updateAgentField('recoveryRules', value)} help="信息不足或失败时的恢复策略。" />
        <InputField label="Tone" value={agentForm.tone} onChange={(value) => updateAgentField('tone', value)} placeholder="Direct, precise, engineering-oriented." />
        <TextAreaField
          label="Memory Schema Fields"
          value={agentForm.memorySchemaFields}
          onChange={(value) => updateAgentField('memorySchemaFields', value)}
          help="每行格式：field_name:type 或 field_name:type*。星号表示 required。"
          rows={6}
        />
        <TextAreaField
          label="Output Schema Fields"
          value={agentForm.outputSchemaFields}
          onChange={(value) => updateAgentField('outputSchemaFields', value)}
          help="每行格式：field_name:type 或 field_name:type*。支持 string、string[]、object、object[] 等。"
          rows={6}
        />
      </FieldSection>
    </div>
  )

  const renderSkillQuestionnaire = () => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <FieldSection title="Identity" subtitle="技能身份、类别与 manifest 基础信息">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputField label="Skill ID" value={skillForm.id} onChange={(value) => updateSkillField('id', value)} placeholder="write-prd" error={validationErrors.id} />
          <InputField label="Skill Name" value={skillForm.name} onChange={(value) => updateSkillField('name', value)} placeholder="Write PRD" error={validationErrors.name} />
          <InputField label="Owner" value={skillForm.owner} onChange={(value) => updateSkillField('owner', value)} placeholder="product-system" />
          <InputField label="Version" value={skillForm.version} onChange={(value) => updateSkillField('version', value)} placeholder="1.0.0" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-text-primary block mb-1.5">Category</span>
            <select value={skillForm.category} onChange={(event) => updateSkillField('category', event.target.value as SkillInfo['category'])} className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent">
              <option value="tool">tool</option>
              <option value="api">api</option>
              <option value="custom">custom</option>
              <option value="system">system</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-text-primary block mb-1.5">Status</span>
            <select value={skillForm.status} onChange={(event) => updateSkillField('status', event.target.value)} className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent">
              <option value="active">active</option>
              <option value="draft">draft</option>
              <option value="paused">paused</option>
            </select>
          </label>
          <InputField label="Output Format" value={skillForm.outputFormat} onChange={(value) => updateSkillField('outputFormat', value)} placeholder="markdown" />
        </div>
        <TextAreaField label="Description" value={skillForm.description} onChange={(value) => updateSkillField('description', value)} rows={3} />
        <TextAreaField label="Purpose" value={skillForm.purpose} onChange={(value) => updateSkillField('purpose', value)} rows={3} />
      </FieldSection>

      <FieldSection title="Usage Boundaries" subtitle="适用、不适用、步骤与失败模式">
        <TextAreaField label="When To Use" value={skillForm.whenToUse} onChange={(value) => updateSkillField('whenToUse', value)} help="每行一个适用场景。" />
        <TextAreaField label="When Not To Use" value={skillForm.whenNotToUse} onChange={(value) => updateSkillField('whenNotToUse', value)} help="每行一个不适用场景。" />
        <TextAreaField label="Procedure" value={skillForm.procedure} onChange={(value) => updateSkillField('procedure', value)} help="每行一个步骤，生成时会自动编号。" />
        <TextAreaField label="Failure Modes" value={skillForm.failureModes} onChange={(value) => updateSkillField('failureModes', value)} help="每行一种失败模式。" />
      </FieldSection>

      <FieldSection title="Contracts" subtitle="输入输出、可调用者、质量门槛和依赖">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextAreaField label="Inputs" value={skillForm.inputs} onChange={(value) => updateSkillField('inputs', value)} help="每行一个输入。" />
          <TextAreaField label="Outputs" value={skillForm.outputs} onChange={(value) => updateSkillField('outputs', value)} help="每行一个输出。" />
        </div>
        <TextAreaField label="Invokable By" value={skillForm.invokableBy} onChange={(value) => updateSkillField('invokableBy', value)} help="每行一个 agent id。" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextAreaField label="Required Inputs" value={skillForm.requiredInputs} onChange={(value) => updateSkillField('requiredInputs', value)} help="manifest.yaml -> requirements.required_inputs" />
          <TextAreaField label="Optional Inputs" value={skillForm.optionalInputs} onChange={(value) => updateSkillField('optionalInputs', value)} help="manifest.yaml -> requirements.optional_inputs" />
        </div>
        <TextAreaField label="Quality Standard" value={skillForm.qualityStandard} onChange={(value) => updateSkillField('qualityStandard', value)} help="每行一项质量标准。" />
        <TextAreaField label="Quality Gates" value={skillForm.qualityGates} onChange={(value) => updateSkillField('qualityGates', value)} help="每行一个 quality gate id。" />
        <TextAreaField label="Dependencies" value={skillForm.dependencies} onChange={(value) => updateSkillField('dependencies', value)} help="每行一个依赖文件或前置项。" />
        <TextAreaField label="Notes" value={skillForm.notes} onChange={(value) => updateSkillField('notes', value)} rows={3} />
      </FieldSection>

      <FieldSection title="Manifest & Schemas" subtitle="标签、运行属性与 schema 字段">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InputField label="Timeout Seconds" value={skillForm.timeoutSeconds} onChange={(value) => updateSkillField('timeoutSeconds', value)} placeholder="120" />
          <InputField label="Determinism" value={skillForm.determinism} onChange={(value) => updateSkillField('determinism', value)} placeholder="medium" />
          <InputField label="Side Effects" value={skillForm.sideEffects} onChange={(value) => updateSkillField('sideEffects', value)} placeholder="false" help="true / false" />
        </div>
        <TextAreaField label="Tags" value={skillForm.tags} onChange={(value) => updateSkillField('tags', value)} help="每行一个 tag。" />
        <TextAreaField
          label="Input Schema Fields"
          value={skillForm.inputSchemaFields}
          onChange={(value) => updateSkillField('inputSchemaFields', value)}
          help="每行格式：field_name:type 或 field_name:type*。星号表示 required。"
          rows={6}
        />
        <TextAreaField
          label="Output Schema Fields"
          value={skillForm.outputSchemaFields}
          onChange={(value) => updateSkillField('outputSchemaFields', value)}
          help="每行格式：field_name:type 或 field_name:type*。支持 string[]、object、object[] 等。"
          rows={6}
        />
      </FieldSection>
    </div>
  )

  const presetOptions = mode === 'agent' ? agentTemplatePresets : skillTemplatePresets
  const title = mode === 'agent' ? 'Agent Template Studio' : 'Skill Template Studio'
  const subtitle = mode === 'agent'
    ? '支持工程模板导入和问卷化创建，先生成本地草稿，再接入真实 runtime。'
    : '把工程级模板转换成可导入、可问卷化、可预览的技能创建工作台。'
  const questionnaireContent = mode === 'agent' ? renderAgentQuestionnaire() : renderSkillQuestionnaire()

  return (
    <div className="space-y-3">
      <GlassCard title={title} subtitle={subtitle} variant="strong">
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-1 p-1 glass rounded-xl w-fit">
              {[
                { id: 'questionnaire', label: 'Questionnaire' },
                { id: 'import', label: 'Import File' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setEntryMode(id as EntryMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    entryMode === id
                      ? 'bg-[var(--color-glass-bg)] text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
              This studio generates scaffolds, imports templates, and creates local drafts.
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-text-primary mb-2">Recommended Presets</div>
            <div className="flex flex-wrap gap-2">
              {presetOptions.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset.id)}
                  className={`px-3 py-2 rounded-xl text-xs transition-colors ${
                    selectedPreset === preset.id
                      ? 'bg-accent text-white'
                      : 'glass-subtle text-text-secondary hover:text-text-primary'
                  }`}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-text-tertiary mt-2">
              这些预设直接来自你提供的工程模板思路，适合作为 OpenClaw UI 内置起点。
            </div>
          </div>

          {entryMode === 'import' && (
            <div className="glass-subtle rounded-2xl p-4 space-y-3">
              <div className="text-xs font-semibold text-text-primary">Import Existing Template</div>
              <div className="text-[10px] text-text-tertiary">
                支持 `.md / .txt / .json / .yaml / .yml / .rtf`。导入会做 best-effort 解析，并同步更新问卷字段。
              </div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-glass-bg)] text-sm text-text-primary cursor-pointer hover:bg-[var(--color-glass-hover)] transition-colors w-fit">
                <FileUp size={16} className="text-accent" />
                <span>{importFileName || 'Choose Template File'}</span>
                <input
                  type="file"
                  accept=".md,.txt,.json,.yaml,.yml,.rtf"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    void handleImportFile(file)
                    event.currentTarget.value = ''
                  }}
                  className="hidden"
                />
              </label>
              {importSourceText && (
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-text-primary">Imported Source Preview</div>
                  <pre className="max-h-72 overflow-auto rounded-xl bg-[var(--color-glass-subtle)] p-3 text-[11px] text-text-secondary whitespace-pre-wrap break-words">
                    {importSourceText}
                  </pre>
                </div>
              )}
            </div>
          )}

          {entryMode === 'questionnaire' ? questionnaireContent : (
            <div className="rounded-2xl px-4 py-3 text-xs bg-warning/10 text-warning">
              Imported text has already been mapped into the questionnaire. You can keep adjusting the fields below and the generated files will update live.
            </div>
          )}

          {entryMode === 'import' && questionnaireContent}
        </div>
      </GlassCard>

      {studioMessage && (
        <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
          {studioMessage}
        </div>
      )}

      <GlassCard
        title="Generated Artifact Pack"
        subtitle="The questionnaire and imported template both feed this preview."
        action={(
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCreateLocalDraft}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors"
            >
              <Sparkles size={14} />
              {submitButtonLabel}
            </button>
            <button
              onClick={handleDownloadPack}
              disabled={artifacts.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--color-glass-bg)] text-text-secondary text-xs font-medium hover:text-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              Download Pack
            </button>
            <button
              onClick={handleCopySelected}
              disabled={!selectedArtifact}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--color-glass-bg)] text-text-secondary text-xs font-medium hover:text-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Copy size={14} />
              Copy Selected
            </button>
            <button
              onClick={handleDownloadSelected}
              disabled={!selectedArtifact}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--color-glass-bg)] text-text-secondary text-xs font-medium hover:text-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              Download Selected
            </button>
          </div>
        )}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-3">
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <button
                key={artifact.path}
                onClick={() => setSelectedArtifactPath(artifact.path)}
                className={`w-full text-left rounded-2xl px-3 py-3 transition-colors ${
                  resolvedSelectedArtifactPath === artifact.path
                    ? 'bg-accent/10 text-accent'
                    : 'glass-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers3 size={14} />
                  <span className="text-xs font-medium">{artifact.label}</span>
                </div>
                <div className="text-[10px] mt-1 break-all">{artifact.path}</div>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {selectedArtifact && (
              <>
                <div className="rounded-2xl px-3 py-2 bg-[var(--color-glass-bg)]">
                  <div className="text-xs font-medium text-text-primary">{selectedArtifact.label}</div>
                  <div className="text-[10px] text-text-tertiary mt-1">{selectedArtifact.description}</div>
                </div>
                <pre className="min-h-[280px] rounded-2xl bg-[var(--color-glass-subtle)] p-4 text-[11px] text-text-primary overflow-auto whitespace-pre-wrap break-words">
                  {selectedArtifact.content}
                </pre>
              </>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
