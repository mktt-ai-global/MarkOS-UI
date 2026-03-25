import type { AgentInfo, SkillInfo } from './mock-data'
import { isRecord, splitLines } from './utils.ts'

export interface TemplateArtifact {
  path: string
  label: string
  description: string
  content: string
}

export interface TemplatePackFileRecord {
  path: string
  label: string
  description?: string
  content: string
}

export type TemplatePackKind = 'agent' | 'skill'

export interface TemplatePackPayload<TForm extends AgentTemplateForm | SkillTemplateForm = AgentTemplateForm | SkillTemplateForm> {
  kind: TemplatePackKind
  id: string
  name: string
  version: string
  generatedAt: string
  form: TForm
  files: TemplatePackFileRecord[]
}

export interface TemplatePackDownload<TForm extends AgentTemplateForm | SkillTemplateForm = AgentTemplateForm | SkillTemplateForm> {
  fileName: string
  payload: TemplatePackPayload<TForm>
  content: string
}

export interface PresetOption {
  id: string
  name: string
  description: string
}

export interface ImportSeedResult<TForm> {
  form: TForm
  normalizedText: string
  notice: string
}

export interface AgentTemplateForm {
  id: string
  name: string
  owner: string
  version: string
  status: string
  type: string
  priority: string
  purpose: string
  mission: string
  responsibilities: string
  nonResponsibilities: string
  inputs: string
  outputs: string
  successCriteria: string
  failureModes: string
  allowedTools: string
  allowedSkills: string
  handoffs: string
  guardrails: string
  observability: string
  toolPolicies: string
  qualityBar: string
  recoveryRules: string
  tone: string
  memorySchemaFields: string
  outputSchemaFields: string
}

export interface SkillTemplateForm {
  id: string
  name: string
  owner: string
  version: string
  status: string
  category: SkillInfo['category']
  description: string
  purpose: string
  whenToUse: string
  whenNotToUse: string
  inputs: string
  outputs: string
  procedure: string
  qualityStandard: string
  failureModes: string
  dependencies: string
  notes: string
  invokableBy: string
  tags: string
  requiredInputs: string
  optionalInputs: string
  qualityGates: string
  timeoutSeconds: string
  determinism: string
  sideEffects: string
  outputFormat: string
  inputSchemaFields: string
  outputSchemaFields: string
}

interface SchemaField {
  name: string
  type: string
  required: boolean
}

interface HandoffRule {
  target: string
  condition: string
}

type StructuredImportMap = Record<string, string>

interface ParsedTemplatePack {
  kind: TemplatePackKind | null
  formSnapshot: Record<string, unknown> | null
  normalizedText: string
  structured: StructuredImportMap
}

export const agentTemplatePresets: PresetOption[] = [
  { id: 'planner', name: 'Planner', description: '需求拆解、阶段计划和任务树编排' },
  { id: 'architect', name: 'Architect', description: '系统设计、模块边界与技术决策' },
  { id: 'builder', name: 'Builder', description: '把方案转换成代码实现与交付步骤' },
  { id: 'reviewer', name: 'Reviewer', description: '风险、规范、一致性与回归质量审查' },
  { id: 'deploy-manager', name: 'Deploy Manager', description: 'VPS 安装、环境修复与 OpenClaw 对接' },
]

export const skillTemplatePresets: PresetOption[] = [
  { id: 'write-prd', name: 'Write PRD', description: '根据项目背景输出结构化产品需求文档' },
  { id: 'generate-ui-spec', name: 'Generate UI Spec', description: '把需求拆解成可执行的界面与交互规范' },
  { id: 'create-api-contract', name: 'Create API Contract', description: '定义接口输入输出与边界约束' },
  { id: 'generate-install-script', name: 'Generate Install Script', description: '生成安装脚本与环境准备说明' },
  { id: 'review-blueprint', name: 'Review Blueprint', description: '对蓝图、方案或草稿进行结构化审查' },
]

const defaultAgentSchemaFields = [
  'project_name:string*',
  'project_goal:string*',
  'primary_constraints:string[]',
  'assumptions:string[]',
  'active_milestones:string[]',
  'known_risks:string[]',
].join('\n')

const defaultAgentOutputFields = [
  'goal:string*',
  'assumptions:string[]',
  'constraints:string[]',
  'phases:object[]*',
  'risks:string[]',
  'next_action:string*',
  'handoff_to:string*',
].join('\n')

const defaultSkillInputFields = [
  'product_name:string*',
  'goal:string*',
  'target_users:string[]',
  'problems:string[]',
  'constraints:string[]',
  'success_metrics:string[]',
].join('\n')

const defaultSkillOutputFields = [
  'title:string*',
  'overview:string*',
  'target_users:string[]',
  'problem_statement:string*',
  'feature_scope:string[]*',
  'non_goals:string[]',
  'acceptance_criteria:string[]*',
  'risks:string[]',
].join('\n')

const agentPresetSeeds: Record<string, Partial<AgentTemplateForm>> = {
  planner: {
    id: 'planner',
    name: 'Planning Agent',
    type: 'orchestrator',
    priority: 'high',
    purpose: '将用户的模糊目标拆解为可执行计划、任务树与阶段性交付物。',
    mission: 'Turn ambiguous user goals into an executable plan with explicit phases, tasks, dependencies, risks, and next actions.',
    responsibilities: [
      '理解用户目标、约束、资源、时间和风险',
      '输出阶段计划、任务拆解、依赖关系和优先级',
      '为 architect / builder / reviewer 提供结构化输入',
    ].join('\n'),
    nonResponsibilities: [
      '不直接生成完整业务代码',
      '不直接做最终视觉设计',
      '不直接修改生产环境配置',
      '不替代 reviewer 做质量裁决',
    ].join('\n'),
    inputs: [
      '用户需求文本',
      '项目上下文',
      '约束条件',
      '历史输出 / memory',
    ].join('\n'),
    outputs: [
      'goals',
      'milestones',
      'work breakdown structure',
      'risks',
      'assumptions',
      'next actions',
    ].join('\n'),
    successCriteria: [
      '输出结构清晰',
      '任务边界明确',
      '可以直接交给下游 agent 执行',
      '显式标注假设、风险和阻塞项',
    ].join('\n'),
    failureModes: [
      '任务拆解过粗',
      '忽略依赖关系',
      '输出不可执行',
      '混入实现细节导致职责越界',
    ].join('\n'),
    allowedTools: ['file_search', 'docs_retriever', 'blueprint_reader', 'task_store'].join('\n'),
    allowedSkills: ['write-prd', 'decompose-project', 'generate-roadmap', 'risk-review'].join('\n'),
    handoffs: [
      'architect: 已完成需求拆解，需要系统设计',
      'builder: 已有明确方案，需要生成实现任务',
      'reviewer: 计划或输出需要质量审查',
    ].join('\n'),
    guardrails: [
      '不得假设未提供的核心业务约束为已确定事实',
      '遇到不确定信息必须显式标注 assumption',
      '输出必须遵守 output.schema.json',
    ].join('\n'),
    observability: [
      'log.input_summary',
      'log.assumptions',
      'log.selected_skills',
      'log.handoff_reason',
    ].join('\n'),
    toolPolicies: [
      '不允许直接修改生产环境',
      '不允许绕过 skill contract 伪造结构化输出',
      '任何 tool 调用都必须服务于当前目标',
    ].join('\n'),
    qualityBar: [
      'structured',
      'executable',
      'dependency-aware',
      'honest about uncertainty',
      'ready for downstream agents',
    ].join('\n'),
    recoveryRules: [
      '当请求信息不足时继续给出 best-effort plan',
      '显式标注 assumptions',
      '优先收敛范围而不是阻塞',
    ].join('\n'),
    tone: 'Direct, precise, engineering-oriented.',
    memorySchemaFields: defaultAgentSchemaFields,
    outputSchemaFields: defaultAgentOutputFields,
  },
  architect: {
    id: 'architect',
    name: 'Architect Agent',
    type: 'specialist',
    priority: 'high',
    purpose: '将需求与计划转化为系统架构、模块边界、数据流和部署方案。',
    mission: 'Turn product and delivery goals into a system architecture that downstream builders can implement safely.',
    responsibilities: [
      '划分模块、数据流、接口和部署拓扑',
      '识别关键 trade-off、技术风险与约束',
      '为 builder 输出可执行的设计蓝图',
    ].join('\n'),
    nonResponsibilities: [
      '不直接写完整生产代码',
      '不替代 planner 做目标拆解',
      '不替代 reviewer 做质量裁决',
    ].join('\n'),
    allowedTools: ['docs_retriever', 'blueprint_reader', 'diagram_writer'].join('\n'),
    allowedSkills: ['generate-ui-spec', 'create-api-contract', 'design-state-machine'].join('\n'),
    handoffs: [
      'builder: 设计边界已经清晰，需要转成工程任务',
      'reviewer: 方案已成形，需要做风险和一致性审查',
    ].join('\n'),
  },
  builder: {
    id: 'builder',
    name: 'Builder Agent',
    type: 'specialist',
    priority: 'high',
    purpose: '把方案和蓝图转换成具体工程改动、接口实现与交付步骤。',
    mission: 'Translate approved plans into implementation-ready engineering work with clear file and interface changes.',
    responsibilities: [
      '把架构方案转成工程任务与改动计划',
      '明确文件级、接口级、测试级的落地步骤',
      '准备交付给 reviewer 的实现摘要',
    ].join('\n'),
    nonResponsibilities: [
      '不替代 architect 做技术选型',
      '不跳过 review 直接宣称质量通过',
    ].join('\n'),
    allowedTools: ['file_search', 'task_store', 'repo_mapper'].join('\n'),
    allowedSkills: ['create-api-contract', 'generate-install-script', 'validate-env-config'].join('\n'),
    handoffs: [
      'reviewer: 实现计划或产物需要质量审查',
      'deploy-manager: 需要落地部署脚本或环境修复建议',
    ].join('\n'),
  },
  reviewer: {
    id: 'reviewer',
    name: 'Reviewer Agent',
    type: 'reviewer',
    priority: 'medium',
    purpose: '检查方案与实现中的风险、缺口、回归与规范一致性。',
    mission: 'Evaluate artifacts for correctness, risk, and readiness, then provide actionable findings.',
    responsibilities: [
      '发现 bug、风险、行为回归和缺测项',
      '对照规范、schema 和 handoff contract 做审查',
      '提供下游可执行的修复建议',
    ].join('\n'),
    nonResponsibilities: [
      '不伪造通过结论',
      '不代替 builder 完成全部实现工作',
    ].join('\n'),
    allowedTools: ['file_search', 'diff_reader', 'eval_runner'].join('\n'),
    allowedSkills: ['review-blueprint', 'risk-review'].join('\n'),
    handoffs: [
      'builder: 需要根据 findings 回修',
      'architect: 当前设计层面存在结构性问题',
    ].join('\n'),
  },
  'deploy-manager': {
    id: 'deploy-manager',
    name: 'Deploy Manager',
    type: 'specialist',
    priority: 'medium',
    purpose: '负责 VPS 安装、环境变量、OpenClaw 对接、探活和修复建议。',
    mission: 'Prepare and validate deployment environments so OpenClaw workloads can be installed and operated reliably.',
    responsibilities: [
      '整理安装步骤、环境变量与依赖要求',
      '输出探活、自检和修复建议',
      '为运营或 builder 提供部署交付物',
    ].join('\n'),
    nonResponsibilities: [
      '不替代 planner 做需求拆解',
      '不替代 reviewer 做正式质量放行',
    ].join('\n'),
    allowedTools: ['env_reader', 'health_checker', 'docs_retriever'].join('\n'),
    allowedSkills: ['generate-install-script', 'validate-env-config', 'generate-deploy-checklist'].join('\n'),
    handoffs: [
      'reviewer: 部署方案需要审查',
      'builder: 安装脚本或配置修复需要实现',
    ].join('\n'),
  },
}

const skillPresetSeeds: Record<string, Partial<SkillTemplateForm>> = {
  'write-prd': {
    id: 'write-prd',
    name: 'Write PRD',
    category: 'custom',
    description: 'Generate a structured PRD from project context.',
    purpose: '根据项目目标、用户画像和业务约束输出标准化 PRD 文档。',
    whenToUse: [
      '需要从模糊需求生成产品需求文档',
      '需要给 architect / builder 提供统一输入',
      '需要形成可评审、可交付的产品范围定义',
    ].join('\n'),
    whenNotToUse: [
      '需求还没有目标或范围',
      '用户只需要一句话总结',
      '当前任务更适合输出技术设计而不是 PRD',
    ].join('\n'),
    inputs: [
      'product_name',
      'goal',
      'target_users',
      'problems',
      'constraints',
      'success_metrics',
    ].join('\n'),
    outputs: [
      'overview',
      'user personas',
      'problem statement',
      'feature scope',
      'non-goals',
      'acceptance criteria',
      'risks',
    ].join('\n'),
    procedure: [
      '理解目标与业务背景',
      '提炼用户与问题',
      '确定范围与非目标',
      '编写功能需求',
      '编写验收标准',
      '标注假设与风险',
    ].join('\n'),
    qualityStandard: [
      '结构完整',
      '语言明确',
      '不混入无关技术细节',
      '可直接进入评审',
    ].join('\n'),
    failureModes: [
      '空泛',
      '过度抽象',
      '范围膨胀',
      '缺少验收标准',
    ].join('\n'),
    dependencies: ['input.schema.json', 'output.schema.json', 'manifest.yaml'].join('\n'),
    notes: '输出必须严格遵循 output.schema.json。',
    invokableBy: ['planner', 'product-manager', 'architect'].join('\n'),
    tags: ['product', 'document', 'planning'].join('\n'),
    requiredInputs: ['product_name', 'goal'].join('\n'),
    optionalInputs: ['target_users', 'constraints', 'success_metrics'].join('\n'),
    qualityGates: [
      'must_include_overview',
      'must_include_scope',
      'must_include_non_goals',
      'must_include_acceptance_criteria',
    ].join('\n'),
    timeoutSeconds: '120',
    determinism: 'medium',
    sideEffects: 'false',
    outputFormat: 'markdown',
    inputSchemaFields: defaultSkillInputFields,
    outputSchemaFields: defaultSkillOutputFields,
  },
  'generate-ui-spec': {
    id: 'generate-ui-spec',
    name: 'Generate UI Spec',
    category: 'custom',
    description: 'Convert product goals into structured UI flows, screens, and interaction contracts.',
    purpose: '把业务目标和用户流程转换成页面结构、交互流程与组件约束。',
    whenToUse: [
      '需要把需求转成具体页面与交互说明',
      '需要给设计或前端提供统一交付规范',
    ].join('\n'),
    whenNotToUse: [
      '当前任务只需要一句视觉方向建议',
      '尚未完成核心目标和范围定义',
    ].join('\n'),
    inputs: ['product_name', 'goal', 'target_users', 'flows', 'constraints'].join('\n'),
    outputs: ['screen_map', 'interaction_rules', 'component_list', 'states', 'edge_cases'].join('\n'),
    procedure: ['梳理核心用户流', '拆页面与模块', '定义状态与交互规则', '补充异常与空态'].join('\n'),
    qualityStandard: ['结构清晰', '状态完整', '组件边界明确'].join('\n'),
    failureModes: ['漏掉关键页面', '状态设计不完整', '描述无法交付开发'].join('\n'),
    invokableBy: ['planner', 'architect', 'builder'].join('\n'),
    tags: ['ui', 'spec', 'frontend'].join('\n'),
    requiredInputs: ['product_name', 'goal'].join('\n'),
    optionalInputs: ['target_users', 'flows', 'constraints'].join('\n'),
    qualityGates: ['must_include_screen_map', 'must_include_states', 'must_include_edge_cases'].join('\n'),
    inputSchemaFields: [
      'product_name:string*',
      'goal:string*',
      'target_users:string[]',
      'flows:string[]',
      'constraints:string[]',
    ].join('\n'),
    outputSchemaFields: [
      'title:string*',
      'screen_map:string[]*',
      'interaction_rules:string[]*',
      'component_list:string[]',
      'states:string[]*',
      'edge_cases:string[]',
    ].join('\n'),
  },
  'create-api-contract': {
    id: 'create-api-contract',
    name: 'Create API Contract',
    category: 'api',
    description: 'Define API request and response contracts with explicit boundaries.',
    purpose: '定义 API 输入输出、错误模型、约束和验收边界。',
    whenToUse: ['需要稳定接口契约', '需要前后端并行开发'].join('\n'),
    whenNotToUse: ['只是临时脚本接口', '没有明确业务边界'].join('\n'),
    inputs: ['api_name', 'goal', 'entities', 'constraints'].join('\n'),
    outputs: ['endpoint_summary', 'request_schema', 'response_schema', 'error_cases'].join('\n'),
    procedure: ['确认接口目标', '定义输入输出', '列出错误情况', '补充约束与示例'].join('\n'),
    qualityStandard: ['字段定义清晰', '错误模型明确', '便于前后端消费'].join('\n'),
    failureModes: ['字段歧义', '缺少错误场景', '缺少验收边界'].join('\n'),
    invokableBy: ['architect', 'builder', 'reviewer'].join('\n'),
    tags: ['api', 'contract', 'backend'].join('\n'),
    requiredInputs: ['api_name', 'goal'].join('\n'),
    optionalInputs: ['entities', 'constraints'].join('\n'),
    qualityGates: ['must_include_request_schema', 'must_include_response_schema', 'must_include_error_cases'].join('\n'),
    inputSchemaFields: [
      'api_name:string*',
      'goal:string*',
      'entities:string[]',
      'constraints:string[]',
    ].join('\n'),
    outputSchemaFields: [
      'title:string*',
      'endpoint_summary:string*',
      'request_schema:object*',
      'response_schema:object*',
      'error_cases:string[]*',
    ].join('\n'),
  },
  'generate-install-script': {
    id: 'generate-install-script',
    name: 'Generate Install Script',
    category: 'system',
    description: 'Prepare repeatable install steps and scripts for OpenClaw environments.',
    purpose: '生成安装脚本、环境变量准备和自检步骤。',
    whenToUse: ['需要快速搭建环境', '需要交付 VPS / 本地安装方案'].join('\n'),
    whenNotToUse: ['当前任务只需要概念性说明', '部署目标尚不明确'].join('\n'),
    inputs: ['target_env', 'runtime', 'constraints', 'dependencies'].join('\n'),
    outputs: ['install_steps', 'env_vars', 'health_checks', 'rollback_notes'].join('\n'),
    procedure: ['识别环境差异', '生成安装步骤', '列出变量和依赖', '补充探活与回滚'].join('\n'),
    qualityStandard: ['步骤可复现', '环境要求明确', '包含自检与失败提示'].join('\n'),
    failureModes: ['依赖遗漏', '脚本不可复现', '缺少回滚信息'].join('\n'),
    invokableBy: ['builder', 'deploy-manager'].join('\n'),
    tags: ['deploy', 'install', 'ops'].join('\n'),
    requiredInputs: ['target_env', 'runtime'].join('\n'),
    optionalInputs: ['constraints', 'dependencies'].join('\n'),
    qualityGates: ['must_include_install_steps', 'must_include_health_checks', 'must_include_env_vars'].join('\n'),
    inputSchemaFields: [
      'target_env:string*',
      'runtime:string*',
      'constraints:string[]',
      'dependencies:string[]',
    ].join('\n'),
    outputSchemaFields: [
      'title:string*',
      'install_steps:string[]*',
      'env_vars:string[]*',
      'health_checks:string[]*',
      'rollback_notes:string[]',
    ].join('\n'),
  },
  'review-blueprint': {
    id: 'review-blueprint',
    name: 'Review Blueprint',
    category: 'custom',
    description: 'Review a blueprint, spec, or draft for gaps, risks, and readiness.',
    purpose: '对蓝图、方案或草稿进行结构化审查并输出可执行 findings。',
    whenToUse: ['方案已经成形，需要做风险与缺口审查'].join('\n'),
    whenNotToUse: ['还没有形成可审查材料', '用户只需要快速摘要'].join('\n'),
    inputs: ['artifact_name', 'goal', 'known_constraints', 'artifact_summary'].join('\n'),
    outputs: ['findings', 'risks', 'missing_items', 'recommended_actions'].join('\n'),
    procedure: ['理解目标', '对照约束检查', '归纳 findings', '给出修复建议'].join('\n'),
    qualityStandard: ['按严重度组织', '结论可执行', '明确残余风险'].join('\n'),
    failureModes: ['只给表面意见', '缺少严重度', '建议不可执行'].join('\n'),
    invokableBy: ['reviewer', 'architect', 'builder'].join('\n'),
    tags: ['review', 'quality', 'risk'].join('\n'),
    requiredInputs: ['artifact_name', 'goal'].join('\n'),
    optionalInputs: ['known_constraints', 'artifact_summary'].join('\n'),
    qualityGates: ['must_include_findings', 'must_include_recommended_actions'].join('\n'),
    inputSchemaFields: [
      'artifact_name:string*',
      'goal:string*',
      'known_constraints:string[]',
      'artifact_summary:string',
    ].join('\n'),
    outputSchemaFields: [
      'title:string*',
      'findings:string[]*',
      'risks:string[]',
      'missing_items:string[]',
      'recommended_actions:string[]*',
    ].join('\n'),
  },
}

function slugify(value: string, fallback = 'draft-template'): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback
}

export function createTemplatePackId(value: string, kind: TemplatePackKind): string {
  return slugify(value, `${kind}-template`)
}

export function buildTemplatePackDownload<TForm extends AgentTemplateForm | SkillTemplateForm>(
  kind: TemplatePackKind,
  form: TForm,
  artifacts: TemplateArtifact[],
  generatedAt = new Date().toISOString(),
): TemplatePackDownload<TForm> {
  const id = createTemplatePackId(form.id, kind)
  const payload: TemplatePackPayload<TForm> = {
    kind,
    id,
    name: form.name,
    version: form.version,
    generatedAt,
    form,
    files: artifacts.map((artifact) => ({
      path: artifact.path,
      label: artifact.label,
      description: artifact.description,
      content: artifact.content,
    })),
  }

  return {
    fileName: `${id}.pack.json`,
    payload,
    content: JSON.stringify(payload, null, 2),
  }
}

function titleize(value: string): string {
  return value
    .split(/[_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function quoteYaml(value: string): string {
  return JSON.stringify(value)
}

function formatMarkdownList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- None yet'
}

function formatYamlList(items: string[], indent = 2): string {
  if (items.length === 0) {
    return `${' '.repeat(indent)}- TBD`
  }

  return items.map((item) => `${' '.repeat(indent)}- ${item}`).join('\n')
}

function parseHandoffs(value: string): HandoffRule[] {
  return splitLines(value).map((line) => {
    const [target, ...rest] = line.split(':')
    return {
      target: target.trim() || 'target-agent',
      condition: rest.join(':').trim() || 'Describe the handoff condition.',
    }
  })
}

function decodeRtfCodepoint(rawValue: string): string {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return ''

  const codepoint = parsed < 0 ? parsed + 65536 : parsed
  try {
    return String.fromCodePoint(codepoint)
  } catch {
    return ''
  }
}

function stripRtfMarkup(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/\\u(-?\d+)\?? ?/g, (_match, rawValue: string) => decodeRtfCodepoint(rawValue))
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, '  ')
    .replace(/\\emdash/g, '—')
    .replace(/\\endash/g, '-')
    .replace(/\\lquote/g, '\'')
    .replace(/\\rquote/g, '\'')
    .replace(/\\ldblquote/g, '"')
    .replace(/\\rdblquote/g, '"')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function assignStructuredImportValue(target: StructuredImportMap, path: string[], value: string) {
  const normalized = value.trim()
  if (!normalized) return

  const fullPath = path.join('.')
  if (fullPath) {
    target[fullPath] = normalized
  }

  const leaf = path[path.length - 1]
  if (leaf && !(leaf in target)) {
    target[leaf] = normalized
  }
}

function flattenStructuredImport(value: unknown, path: string[] = [], acc: StructuredImportMap = {}): StructuredImportMap {
  if (value === null || value === undefined) return acc

  if (Array.isArray(value)) {
    const primitiveItems = value.filter((item) => (
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    ))

    if (primitiveItems.length === value.length) {
      assignStructuredImportValue(acc, path, primitiveItems.map((item) => String(item)).join('\n'))
      return acc
    }

    assignStructuredImportValue(acc, path, JSON.stringify(value, null, 2))
    return acc
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    for (const [key, nested] of entries) {
      flattenStructuredImport(nested, [...path, key], acc)
    }
    return acc
  }

  assignStructuredImportValue(acc, path, String(value))
  return acc
}

function stripYamlScalarQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseYamlLikeImport(source: string): StructuredImportMap {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const result: StructuredImportMap = {}
  const pathStack: Array<{ indent: number; key: string }> = []

  const nextMeaningfulLine = (startIndex: number) => {
    for (let index = startIndex; index < lines.length; index += 1) {
      const trimmed = lines[index].trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      return {
        index,
        indent: lines[index].match(/^ */)?.[0].length || 0,
        text: trimmed,
      }
    }
    return null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = rawLine.match(/^ */)?.[0].length || 0
    while (pathStack.length > 0 && indent <= pathStack[pathStack.length - 1].indent) {
      pathStack.pop()
    }

    if (trimmed.startsWith('- ')) {
      const currentPath = pathStack.map((segment) => segment.key)
      assignStructuredImportValue(result, currentPath, [
        result[currentPath.join('.')] || '',
        stripYamlScalarQuotes(trimmed.slice(2)),
      ].filter(Boolean).join('\n'))
      continue
    }

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmed.slice(0, colonIndex).trim()
    const valuePart = trimmed.slice(colonIndex + 1).trim()
    const currentPath = [...pathStack.map((segment) => segment.key), key]

    if (valuePart === '|' || valuePart === '>') {
      const blockLines: string[] = []
      const next = nextMeaningfulLine(index + 1)
      const blockIndent = next && next.indent > indent ? next.indent : indent + 2

      let pointer = index + 1
      while (pointer < lines.length) {
        const candidate = lines[pointer]
        const candidateIndent = candidate.match(/^ */)?.[0].length || 0
        const candidateTrimmed = candidate.trim()

        if (candidateTrimmed && candidateIndent <= indent) break
        if (candidateTrimmed) {
          blockLines.push(candidate.slice(Math.min(candidate.length, blockIndent)).replace(/\s+$/g, ''))
        } else if (blockLines.length > 0) {
          blockLines.push('')
        }
        pointer += 1
      }

      assignStructuredImportValue(result, currentPath, blockLines.join('\n').trim())
      index = Math.max(index, pointer - 1)
      continue
    }

    if (!valuePart) {
      pathStack.push({ indent, key })
      continue
    }

    assignStructuredImportValue(result, currentPath, stripYamlScalarQuotes(valuePart))
  }

  return result
}

function parseStructuredImport(fileName: string, source: string): StructuredImportMap {
  const trimmed = source.trim()
  const lowerName = fileName.toLowerCase()

  if (lowerName.endsWith('.json') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return flattenStructuredImport(parsed)
    } catch {
      return {}
    }
  }

  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml')) {
    return parseYamlLikeImport(trimmed)
  }

  return {}
}

function mergeStructuredImports(...maps: StructuredImportMap[]): StructuredImportMap {
  return maps.reduce<StructuredImportMap>((acc, item) => ({ ...acc, ...item }), {})
}

function isTemplatePackFileRecord(value: unknown): value is TemplatePackFileRecord {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.label === 'string' &&
    typeof value.content === 'string'
  )
}

function createPackMetadataImport(parsed: Record<string, unknown>): StructuredImportMap {
  const keys = ['id', 'name', 'version', 'kind'] as const
  return keys.reduce<StructuredImportMap>((acc, key) => {
    const value = parsed[key]
    if (typeof value === 'string' && value.trim()) {
      acc[key] = value.trim()
    }
    return acc
  }, {})
}

function pickTemplatePackPrimaryText(files: TemplatePackFileRecord[], kind: TemplatePackKind | null): string {
  const preferredLabels = kind === 'skill'
    ? ['SKILL.md', 'manifest.yaml']
    : ['agent.md', 'system.prompt.md']

  for (const label of preferredLabels) {
    const match = files.find((file) => file.label === label || file.path.endsWith(`/${label}`))
    if (match) {
      return normalizeImportedText(match.path || match.label, match.content)
    }
  }

  const firstMarkdown = files.find((file) => /\.(md|txt)$/i.test(file.path || file.label))
  if (firstMarkdown) {
    return normalizeImportedText(firstMarkdown.path || firstMarkdown.label, firstMarkdown.content)
  }

  const firstStructured = files.find((file) => /\.(json|ya?ml)$/i.test(file.path || file.label))
  if (firstStructured) {
    return normalizeImportedText(firstStructured.path || firstStructured.label, firstStructured.content)
  }

  return ''
}

function parseTemplatePackImport(fileName: string, source: string): ParsedTemplatePack | null {
  const trimmed = source.trim()
  const lowerName = fileName.toLowerCase()
  if (!lowerName.endsWith('.json') && !trimmed.startsWith('{')) {
    return null
  }

  try {
    const parsedUnknown = JSON.parse(trimmed) as unknown
    if (!isRecord(parsedUnknown) || !Array.isArray(parsedUnknown.files)) {
      return null
    }
    const parsed = parsedUnknown

    const rawFiles = parsed.files as unknown[]
    const files = rawFiles.filter((file): file is TemplatePackFileRecord => isTemplatePackFileRecord(file))
    if (files.length === 0) {
      return null
    }

    const kind = parsed.kind === 'agent' || parsed.kind === 'skill' ? parsed.kind : null
    const structuredFromFiles = files.map((file) =>
      parseStructuredImport(file.path || file.label, normalizeImportedText(file.path || file.label, file.content)),
    )

    return {
      kind,
      formSnapshot: isRecord(parsed.form) ? parsed.form : null,
      normalizedText: pickTemplatePackPrimaryText(files, kind),
      structured: mergeStructuredImports(createPackMetadataImport(parsed), ...structuredFromFiles),
    }
  } catch {
    return null
  }
}

function mergeFormSnapshot<TForm extends object>(current: TForm, snapshot: Record<string, unknown> | null): TForm {
  if (!snapshot) return current

  const next = { ...current }
  for (const key of Object.keys(current) as Array<keyof TForm>) {
    const value = snapshot[key as string]
    if (typeof value === 'string') {
      next[key] = value as TForm[keyof TForm]
    }
  }

  return next
}

function pickStructuredValue(structured: StructuredImportMap, aliases: string[], fallback: string): string {
  for (const alias of aliases) {
    const direct = structured[alias]
    if (direct) return direct

    const normalizedAlias = alias.toLowerCase()
    const match = Object.entries(structured).find(([key, value]) => key.toLowerCase() === normalizedAlias && value)
    if (match) return match[1]
  }

  return fallback
}

function normalizeImportedText(fileName: string, source: string): string {
  if (fileName.toLowerCase().endsWith('.rtf') || source.startsWith('{\\rtf')) {
    return stripRtfMarkup(source)
  }
  return source.trim()
}

function extractFrontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  return match[1]
    .split('\n')
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split(':')
      if (!key || rest.length === 0) return acc
      acc[key.trim()] = rest.join(':').trim()
      return acc
    }, {})
}

function extractSection(text: string, labels: string[]): string {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const regex = new RegExp(`(?:^|\\n)#+\\s*(?:\\d+\\.\\s*)?(?:${labelPattern})\\s*\\n([\\s\\S]*?)(?=\\n#+\\s*(?:\\d+\\.\\s*)?[A-Za-z0-9]|$)`, 'i')
  const match = text.match(regex)
  return match?.[1]?.trim() || ''
}

function blockToListText(block: string, fallback = ''): string {
  if (!block) return fallback

  const lines = block
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)

  return lines.join('\n') || fallback
}

function parseSchemaFields(value: string, fallback: string): SchemaField[] {
  const lines = splitLines(value)
  const seed = lines.length > 0 ? lines : splitLines(fallback)

  return seed.map((line) => {
    const [rawName, rawType = 'string'] = line.split(':')
    const required = rawType.endsWith('*')
    const type = rawType.replace(/\*$/, '').trim() || 'string'
    return {
      name: rawName.trim() || 'field_name',
      type,
      required,
    }
  })
}

function schemaPropertyFromType(type: string): Record<string, unknown> {
  switch (type) {
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'object':
      return { type: 'object', additionalProperties: true }
    case 'object[]':
      return { type: 'array', items: { type: 'object', additionalProperties: true } }
    case 'number[]':
      return { type: 'array', items: { type: 'number' } }
    case 'boolean[]':
      return { type: 'array', items: { type: 'boolean' } }
    case 'markdown':
      return { type: 'string' }
    case 'string[]':
      return { type: 'array', items: { type: 'string' } }
    default:
      return { type: 'string' }
  }
}

function buildJsonSchema(title: string, fields: SchemaField[]): string {
  const properties = fields.reduce<Record<string, Record<string, unknown>>>((acc, field) => {
    acc[field.name] = schemaPropertyFromType(field.type)
    return acc
  }, {})
  const required = fields.filter((field) => field.required).map((field) => field.name)

  return JSON.stringify({
    $schema: 'http://json-schema.org/draft-07/schema#',
    title,
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }, null, 2)
}

function exampleValueForField(field: SchemaField): unknown {
  switch (field.type) {
    case 'number':
      return 1
    case 'boolean':
      return true
    case 'object':
      return { note: 'Fill in object fields here' }
    case 'object[]':
      return [{ note: 'Fill in array item fields here' }]
    case 'number[]':
      return [1]
    case 'boolean[]':
      return [true]
    case 'string[]':
      return [`example_${field.name}`]
    default:
      return `example_${field.name}`
  }
}

function buildExampleJson(fields: SchemaField[]): string {
  const example = fields.reduce<Record<string, unknown>>((acc, field) => {
    acc[field.name] = exampleValueForField(field)
    return acc
  }, {})
  return JSON.stringify(example, null, 2)
}

function buildExampleMarkdown(title: string, fields: SchemaField[]): string {
  const sections = fields.map((field) => {
    const heading = titleize(field.name)
    const body = field.type.endsWith('[]')
      ? '- example item'
      : field.type === 'object' || field.type === 'object[]'
        ? '```json\n{\n  "note": "replace with structured content"\n}\n```'
        : `Placeholder for ${field.name}.`

    return `## ${heading}\n${body}`
  })

  return `# ${title}\n\n${sections.join('\n\n')}`
}

function buildSkillExampleMarkdown(form: SkillTemplateForm, outputFields: SchemaField[]): string {
  return buildExampleMarkdown(`${form.name} Output Example`, outputFields)
}

function buildBundleArtifact(
  basePath: string,
  kind: 'agent' | 'skill',
  id: string,
  name: string,
  version: string,
  artifacts: TemplateArtifact[],
): TemplateArtifact {
  return {
    path: `${basePath}/bundle.json`,
    label: 'bundle.json',
    description: 'Generated artifact manifest for this template pack.',
    content: JSON.stringify({
      kind,
      id,
      name,
      version,
      generatedFiles: artifacts.map((artifact) => ({
        path: artifact.path,
        label: artifact.label,
        description: artifact.description,
      })),
    }, null, 2),
  }
}

export function createAgentTemplateForm(presetId = 'planner'): AgentTemplateForm {
  const preset = agentPresetSeeds[presetId] || agentPresetSeeds.planner
  const id = slugify(preset.id || preset.name || 'agent-template')

  return {
    id,
    name: preset.name || 'Template Agent',
    owner: preset.owner || 'core-ai-team',
    version: preset.version || '1.0.0',
    status: preset.status || 'active',
    type: preset.type || 'specialist',
    priority: preset.priority || 'medium',
    purpose: preset.purpose || 'Describe the core goal of this agent.',
    mission: preset.mission || 'Describe the mission in one concise sentence.',
    responsibilities: preset.responsibilities || 'Responsibility one\nResponsibility two',
    nonResponsibilities: preset.nonResponsibilities || 'Out-of-scope item one\nOut-of-scope item two',
    inputs: preset.inputs || 'input_one\ninput_two',
    outputs: preset.outputs || 'output_one\noutput_two',
    successCriteria: preset.successCriteria || 'Success criterion one\nSuccess criterion two',
    failureModes: preset.failureModes || 'Failure mode one\nFailure mode two',
    allowedTools: preset.allowedTools || 'file_search\ndocs_retriever',
    allowedSkills: preset.allowedSkills || 'write-prd\nreview-blueprint',
    handoffs: preset.handoffs || 'reviewer: Artifact needs quality validation',
    guardrails: preset.guardrails || 'Do not invent missing requirements as facts.',
    observability: preset.observability || 'log.input_summary\nlog.handoff_reason',
    toolPolicies: preset.toolPolicies || 'Any tool call must support the current objective.',
    qualityBar: preset.qualityBar || 'structured\nexecutable',
    recoveryRules: preset.recoveryRules || 'Continue with bounded assumptions when information is missing.',
    tone: preset.tone || 'Direct, precise, engineering-oriented.',
    memorySchemaFields: preset.memorySchemaFields || defaultAgentSchemaFields,
    outputSchemaFields: preset.outputSchemaFields || defaultAgentOutputFields,
  }
}

export function createSkillTemplateForm(presetId = 'write-prd'): SkillTemplateForm {
  const preset = skillPresetSeeds[presetId] || skillPresetSeeds['write-prd']
  const id = slugify(preset.id || preset.name || 'skill-template')

  return {
    id,
    name: preset.name || 'Template Skill',
    owner: preset.owner || 'product-system',
    version: preset.version || '1.0.0',
    status: preset.status || 'active',
    category: preset.category || 'custom',
    description: preset.description || 'Describe the skill in one sentence.',
    purpose: preset.purpose || 'Describe the concrete outcome this skill produces.',
    whenToUse: preset.whenToUse || 'Use case one\nUse case two',
    whenNotToUse: preset.whenNotToUse || 'Out-of-scope one\nOut-of-scope two',
    inputs: preset.inputs || 'input_one\ninput_two',
    outputs: preset.outputs || 'output_one\noutput_two',
    procedure: preset.procedure || 'Step one\nStep two\nStep three',
    qualityStandard: preset.qualityStandard || 'Quality bar one\nQuality bar two',
    failureModes: preset.failureModes || 'Failure mode one\nFailure mode two',
    dependencies: preset.dependencies || 'input.schema.json\noutput.schema.json\nmanifest.yaml',
    notes: preset.notes || 'Output must match output.schema.json.',
    invokableBy: preset.invokableBy || 'planner\narchitect',
    tags: preset.tags || 'planning\ndocument',
    requiredInputs: preset.requiredInputs || 'product_name\ngoal',
    optionalInputs: preset.optionalInputs || 'constraints\nsuccess_metrics',
    qualityGates: preset.qualityGates || 'must_include_scope\nmust_include_acceptance_criteria',
    timeoutSeconds: preset.timeoutSeconds || '120',
    determinism: preset.determinism || 'medium',
    sideEffects: preset.sideEffects || 'false',
    outputFormat: preset.outputFormat || 'markdown',
    inputSchemaFields: preset.inputSchemaFields || defaultSkillInputFields,
    outputSchemaFields: preset.outputSchemaFields || defaultSkillOutputFields,
  }
}

export function applyAgentTemplateImport(fileName: string, source: string, current: AgentTemplateForm): ImportSeedResult<AgentTemplateForm> {
  const packImport = parseTemplatePackImport(fileName, source)
  const normalizedText = packImport?.normalizedText || normalizeImportedText(fileName, source)
  const shouldPreferSnapshot = Boolean(packImport?.formSnapshot) && packImport?.kind !== 'skill'
  const structured = shouldPreferSnapshot ? {} : (packImport?.structured || parseStructuredImport(fileName, normalizedText))
  const frontmatter = extractFrontmatter(normalizedText)
  const baseName = slugify(fileName.replace(/\.[^.]+$/, ''))
  const purpose = extractSection(normalizedText, ['Purpose'])
  const responsibilities = extractSection(normalizedText, ['Responsibilities'])
  const nonResponsibilities = extractSection(normalizedText, ['Non-Responsibilities', 'Non Responsibilities'])
  const inputs = extractSection(normalizedText, ['Inputs'])
  const outputs = extractSection(normalizedText, ['Outputs'])
  const guardrails = extractSection(normalizedText, ['Guardrails'])
  const seededForm = packImport?.kind !== 'skill'
    ? mergeFormSnapshot(current, packImport?.formSnapshot || null)
    : current
  const notice = packImport
    ? packImport.formSnapshot && packImport.kind !== 'skill'
      ? 'Imported a local template pack and restored the saved agent questionnaire snapshot. Review the fields before saving.'
      : 'Imported a template pack in best-effort mode. Review the questionnaire fields before saving the local template.'
    : 'Imported template text was parsed in best-effort mode. Review the questionnaire fields before saving the local template.'

  return {
    normalizedText,
    notice,
    form: {
      ...seededForm,
      id: slugify(pickStructuredValue(structured, ['id', 'identity.id', 'agent.id'], frontmatter.id || seededForm.id || baseName)),
      name: pickStructuredValue(structured, ['name', 'identity.name', 'agent.name'], frontmatter.name || seededForm.name),
      owner: pickStructuredValue(structured, ['owner', 'identity.owner', 'metadata.owner'], frontmatter.owner || seededForm.owner),
      version: pickStructuredValue(structured, ['version', 'identity.version', 'metadata.version'], frontmatter.version || seededForm.version),
      status: pickStructuredValue(structured, ['status', 'identity.status', 'metadata.status'], frontmatter.status || seededForm.status),
      type: pickStructuredValue(structured, ['type', 'identity.type', 'metadata.type'], frontmatter.type || seededForm.type),
      priority: pickStructuredValue(structured, ['priority', 'metadata.priority'], seededForm.priority),
      purpose: pickStructuredValue(structured, ['purpose', 'overview.purpose'], purpose || seededForm.purpose),
      mission: pickStructuredValue(structured, ['mission', 'overview.mission'], seededForm.mission),
      responsibilities: pickStructuredValue(
        structured,
        ['responsibilities', 'behavior.responsibilities'],
        blockToListText(responsibilities, seededForm.responsibilities),
      ),
      nonResponsibilities: pickStructuredValue(
        structured,
        ['nonResponsibilities', 'non_responsibilities', 'behavior.nonResponsibilities'],
        blockToListText(nonResponsibilities, seededForm.nonResponsibilities),
      ),
      inputs: pickStructuredValue(structured, ['inputs', 'contracts.inputs'], blockToListText(inputs, seededForm.inputs)),
      outputs: pickStructuredValue(structured, ['outputs', 'contracts.outputs'], blockToListText(outputs, seededForm.outputs)),
      successCriteria: pickStructuredValue(structured, ['successCriteria', 'success_criteria'], seededForm.successCriteria),
      failureModes: pickStructuredValue(structured, ['failureModes', 'failure_modes'], seededForm.failureModes),
      allowedTools: pickStructuredValue(structured, ['allowedTools', 'allowed_tools', 'tools'], seededForm.allowedTools),
      allowedSkills: pickStructuredValue(structured, ['allowedSkills', 'allowed_skills', 'skills'], seededForm.allowedSkills),
      handoffs: pickStructuredValue(structured, ['handoffs', 'handoff'], seededForm.handoffs),
      guardrails: pickStructuredValue(structured, ['guardrails', 'safety.guardrails'], blockToListText(guardrails, seededForm.guardrails)),
      observability: pickStructuredValue(structured, ['observability'], seededForm.observability),
      toolPolicies: pickStructuredValue(structured, ['toolPolicies', 'tool_policies'], seededForm.toolPolicies),
      qualityBar: pickStructuredValue(structured, ['qualityBar', 'quality_bar'], seededForm.qualityBar),
      recoveryRules: pickStructuredValue(structured, ['recoveryRules', 'recovery_rules'], seededForm.recoveryRules),
      tone: pickStructuredValue(structured, ['tone'], seededForm.tone),
      memorySchemaFields: pickStructuredValue(structured, ['memorySchemaFields', 'memory_schema_fields'], seededForm.memorySchemaFields),
      outputSchemaFields: pickStructuredValue(structured, ['outputSchemaFields', 'output_schema_fields'], seededForm.outputSchemaFields),
    },
  }
}

export function applySkillTemplateImport(fileName: string, source: string, current: SkillTemplateForm): ImportSeedResult<SkillTemplateForm> {
  const packImport = parseTemplatePackImport(fileName, source)
  const normalizedText = packImport?.normalizedText || normalizeImportedText(fileName, source)
  const shouldPreferSnapshot = Boolean(packImport?.formSnapshot) && packImport?.kind !== 'agent'
  const structured = shouldPreferSnapshot ? {} : (packImport?.structured || parseStructuredImport(fileName, normalizedText))
  const frontmatter = extractFrontmatter(normalizedText)
  const baseName = slugify(fileName.replace(/\.[^.]+$/, ''))
  const purpose = extractSection(normalizedText, ['Purpose'])
  const whenToUse = extractSection(normalizedText, ['When To Use'])
  const whenNotToUse = extractSection(normalizedText, ['When Not To Use'])
  const inputs = extractSection(normalizedText, ['Inputs'])
  const outputs = extractSection(normalizedText, ['Outputs'])
  const procedure = extractSection(normalizedText, ['Procedure'])
  const quality = extractSection(normalizedText, ['Quality Standard'])
  const seededForm = packImport?.kind !== 'agent'
    ? mergeFormSnapshot(current, packImport?.formSnapshot || null)
    : current
  const notice = packImport
    ? packImport.formSnapshot && packImport.kind !== 'agent'
      ? 'Imported a local template pack and restored the saved skill questionnaire snapshot. Review the fields before saving.'
      : 'Imported a template pack in best-effort mode. Review and adjust the generated fields before saving the local template.'
    : 'Imported template text was parsed in best-effort mode. Review and adjust the generated fields before saving the local template.'

  return {
    normalizedText,
    notice,
    form: {
      ...seededForm,
      id: slugify(pickStructuredValue(structured, ['id', 'identity.id', 'skill.id'], frontmatter.id || seededForm.id || baseName)),
      name: pickStructuredValue(structured, ['name', 'identity.name', 'skill.name'], frontmatter.name || seededForm.name),
      owner: pickStructuredValue(structured, ['owner', 'identity.owner', 'metadata.owner'], frontmatter.owner || seededForm.owner),
      version: pickStructuredValue(structured, ['version', 'identity.version', 'metadata.version'], frontmatter.version || seededForm.version),
      status: pickStructuredValue(structured, ['status', 'identity.status', 'metadata.status'], frontmatter.status || seededForm.status),
      category: pickStructuredValue(structured, ['category', 'kind', 'type'], seededForm.category) as SkillInfo['category'],
      description: pickStructuredValue(structured, ['description', 'summary'], frontmatter.description || seededForm.description),
      purpose: pickStructuredValue(structured, ['purpose', 'overview.purpose'], purpose || seededForm.purpose),
      whenToUse: pickStructuredValue(structured, ['whenToUse', 'when_to_use'], blockToListText(whenToUse, seededForm.whenToUse)),
      whenNotToUse: pickStructuredValue(structured, ['whenNotToUse', 'when_not_to_use'], blockToListText(whenNotToUse, seededForm.whenNotToUse)),
      inputs: pickStructuredValue(structured, ['inputs', 'contracts.inputs'], blockToListText(inputs, seededForm.inputs)),
      outputs: pickStructuredValue(structured, ['outputs', 'contracts.outputs'], blockToListText(outputs, seededForm.outputs)),
      procedure: pickStructuredValue(structured, ['procedure', 'steps'], blockToListText(procedure, seededForm.procedure)),
      qualityStandard: pickStructuredValue(structured, ['qualityStandard', 'quality_standard'], blockToListText(quality, seededForm.qualityStandard)),
      failureModes: pickStructuredValue(structured, ['failureModes', 'failure_modes'], seededForm.failureModes),
      dependencies: pickStructuredValue(structured, ['dependencies'], seededForm.dependencies),
      notes: pickStructuredValue(structured, ['notes'], seededForm.notes),
      invokableBy: pickStructuredValue(structured, ['invokableBy', 'invokable_by'], seededForm.invokableBy),
      tags: pickStructuredValue(structured, ['tags'], seededForm.tags),
      requiredInputs: pickStructuredValue(structured, ['requiredInputs', 'required_inputs'], seededForm.requiredInputs),
      optionalInputs: pickStructuredValue(structured, ['optionalInputs', 'optional_inputs'], seededForm.optionalInputs),
      qualityGates: pickStructuredValue(structured, ['qualityGates', 'quality_gates'], seededForm.qualityGates),
      timeoutSeconds: pickStructuredValue(structured, ['timeoutSeconds', 'timeout_seconds'], seededForm.timeoutSeconds),
      determinism: pickStructuredValue(structured, ['determinism'], seededForm.determinism),
      sideEffects: pickStructuredValue(structured, ['sideEffects', 'side_effects'], seededForm.sideEffects),
      outputFormat: pickStructuredValue(structured, ['outputFormat', 'output_format'], seededForm.outputFormat),
      inputSchemaFields: pickStructuredValue(structured, ['inputSchemaFields', 'input_schema_fields'], seededForm.inputSchemaFields),
      outputSchemaFields: pickStructuredValue(structured, ['outputSchemaFields', 'output_schema_fields'], seededForm.outputSchemaFields),
    },
  }
}

export function buildAgentDraft(form: AgentTemplateForm): AgentInfo {
  return {
    id: slugify(form.id),
    name: form.name.trim() || 'Local Agent Template',
    model: `${form.type}/draft`,
    status: 'idle',
    sessions: 0,
    tokensUsed: '0',
    successRate: 0,
    uptime: 'Local',
    lastActive: 'Just now',
    workspace: `agents/${slugify(form.id)}`,
  }
}

export function buildSkillDraft(form: SkillTemplateForm): SkillInfo {
  return {
    id: slugify(form.id),
    name: form.name.trim() || 'Local Skill Template',
    description: form.description.trim() || form.purpose.trim() || 'Local template generated from Template Studio.',
    version: form.version.trim() || '0.1.0-local',
    category: form.category,
    installed: false,
    usage: 0,
    author: form.owner.trim() || 'template-studio',
    rating: 0,
  }
}

export function buildAgentArtifacts(form: AgentTemplateForm): TemplateArtifact[] {
  const responsibilities = splitLines(form.responsibilities)
  const nonResponsibilities = splitLines(form.nonResponsibilities)
  const inputs = splitLines(form.inputs)
  const outputs = splitLines(form.outputs)
  const successCriteria = splitLines(form.successCriteria)
  const failureModes = splitLines(form.failureModes)
  const allowedTools = splitLines(form.allowedTools)
  const allowedSkills = splitLines(form.allowedSkills)
  const handoffs = parseHandoffs(form.handoffs)
  const guardrails = splitLines(form.guardrails)
  const observability = splitLines(form.observability)
  const toolPolicies = splitLines(form.toolPolicies)
  const qualityBar = splitLines(form.qualityBar)
  const recoveryRules = splitLines(form.recoveryRules)
  const memoryFields = parseSchemaFields(form.memorySchemaFields, defaultAgentSchemaFields)
  const outputFields = parseSchemaFields(form.outputSchemaFields, defaultAgentOutputFields)
  const agentId = slugify(form.id)
  const outputFieldNames = outputFields.map((field) => field.name)

  const agentMd = [
    '---',
    `id: ${agentId}`,
    `name: ${form.name}`,
    `version: ${form.version}`,
    `owner: ${form.owner}`,
    `status: ${form.status}`,
    `type: ${form.type}`,
    `priority: ${form.priority}`,
    '---',
    '',
    '# 1. Purpose',
    form.purpose,
    '',
    '# 2. Responsibilities',
    formatMarkdownList(responsibilities),
    '',
    '# 3. Non-Responsibilities',
    formatMarkdownList(nonResponsibilities),
    '',
    '# 4. Inputs',
    formatMarkdownList(inputs),
    '',
    '# 5. Outputs',
    formatMarkdownList(outputs),
    '',
    '# 6. Success Criteria',
    formatMarkdownList(successCriteria),
    '',
    '# 7. Failure Modes',
    formatMarkdownList(failureModes),
    '',
    '# 8. Allowed Tools',
    formatMarkdownList(allowedTools),
    '',
    '# 9. Allowed Skills',
    formatMarkdownList(allowedSkills),
    '',
    '# 10. Handoffs',
    handoffs.length > 0
      ? handoffs.map((handoff) => `- to: ${handoff.target}\n  when: ${handoff.condition}`).join('\n')
      : '- to: reviewer\n  when: Artifact needs validation',
    '',
    '# 11. Guardrails',
    formatMarkdownList(guardrails),
    '',
    '# 12. Observability',
    formatMarkdownList(observability),
    '',
    '# 13. Version Notes',
    `- v${form.version} Initial local template generated from Template Studio`,
  ].join('\n')

  const systemPrompt = [
    '# Role',
    `You are the ${form.name}.`,
    '',
    '# Mission',
    form.mission,
    '',
    '# You must',
    formatMarkdownList(responsibilities),
    '',
    '# You must not',
    formatMarkdownList(nonResponsibilities),
    '',
    '# Decision Policy',
    '1. Clarify the objective',
    '2. Extract the active constraints',
    '3. Identify missing information',
    '4. Make bounded assumptions when necessary',
    '5. Produce structured output aligned with the contract',
    '6. Handoff when the request crosses role boundaries',
    '',
    '# Output Format',
    'Return output that matches output.schema.json exactly.',
    '',
    '# Quality Bar',
    formatMarkdownList(qualityBar),
    '',
    '# Handoff Rules',
    handoffs.length > 0
      ? handoffs.map((handoff) => `- hand off to ${handoff.target} when ${handoff.condition}`).join('\n')
      : '- hand off to reviewer when validation is required',
    '',
    '# Recovery Rules',
    formatMarkdownList(recoveryRules),
    '',
    '# Tone',
    form.tone,
  ].join('\n')

  const toolsYaml = [
    'tools:',
    ...(allowedTools.length > 0
      ? allowedTools.flatMap((tool) => [
          `  - name: ${tool}`,
          '    purpose: Configure the concrete purpose when wiring this tool to runtime.',
          '    allowed_operations:',
          '      - use',
          '    forbidden_operations:',
          '      - delete',
          '      - overwrite',
        ])
      : [
          '  - name: file_search',
          '    purpose: Configure in runtime',
          '    allowed_operations:',
          '      - use',
        ]),
    'policies:',
    ...(toolPolicies.length > 0
      ? toolPolicies.map((policy) => `  - ${policy}`)
      : ['  - Any tool invocation must support the current objective.']),
  ].join('\n')

  const handoffYaml = [
    'handoffs:',
    ...(handoffs.length > 0
      ? handoffs.flatMap((handoff) => [
          `  - target: ${handoff.target}`,
          `    condition: ${quoteYaml(handoff.condition)}`,
          '    payload:',
          '      required_fields:',
          ...formatYamlList(outputFieldNames, 8).split('\n'),
        ])
      : [
          '  - target: reviewer',
          '    condition: "Validation is required before downstream execution."',
          '    payload:',
          '      required_fields:',
          '        - goal',
          '        - next_action',
        ]),
  ].join('\n')

  const evalCases = [
    'cases:',
    `  - id: ${agentId}_case_001`,
    `    title: ${quoteYaml(`${form.name} starter case`)}`,
    '    input: |',
    `      ${form.purpose}`,
    '    expected:',
    '      must_include:',
    ...formatYamlList(outputFieldNames.slice(0, Math.min(outputFieldNames.length, 5)), 8).split('\n'),
    `      handoff_to: ${quoteYaml(handoffs[0]?.target || 'reviewer')}`,
  ].join('\n')

  const rubric = [
    `# ${form.name} Rubric`,
    '',
    '## 1. Goal Alignment',
    '- 5: Output matches the mission and respects role boundaries',
    '- 3: Output is mostly aligned but has missing structure',
    '- 1: Output drifts away from the mission',
    '',
    '## 2. Structured Output',
    '- 5: Output is fully aligned with output.schema.json',
    '- 3: Output is mostly structured with a few gaps',
    '- 1: Output is hard to consume downstream',
    '',
    '## 3. Risk and Assumption Handling',
    '- 5: Risks and assumptions are explicit and actionable',
    '- 3: Some uncertainty is surfaced but incomplete',
    '- 1: Hidden assumptions or missing risk notes',
  ].join('\n')

  const changelog = [
    '# Changelog',
    '',
    `## v${form.version}`,
    '- Initial engineering template scaffold generated from Template Studio.',
  ].join('\n')

  const artifacts: TemplateArtifact[] = [
    {
      path: `agents/${agentId}/agent.md`,
      label: 'agent.md',
      description: 'Agent identity, role boundary, responsibilities, and handoffs.',
      content: agentMd,
    },
    {
      path: `agents/${agentId}/system.prompt.md`,
      label: 'system.prompt.md',
      description: 'System prompt contract for runtime use.',
      content: systemPrompt,
    },
    {
      path: `agents/${agentId}/tools.yaml`,
      label: 'tools.yaml',
      description: 'Machine-readable tool allowlist and policy notes.',
      content: toolsYaml,
    },
    {
      path: `agents/${agentId}/handoff.yaml`,
      label: 'handoff.yaml',
      description: 'Handoff rules and required payload fields.',
      content: handoffYaml,
    },
    {
      path: `agents/${agentId}/memory.schema.json`,
      label: 'memory.schema.json',
      description: 'Structured memory fields for this agent.',
      content: buildJsonSchema(`${titleize(agentId.replace(/-/g, '_'))}Memory`, memoryFields),
    },
    {
      path: `agents/${agentId}/output.schema.json`,
      label: 'output.schema.json',
      description: 'Output contract for downstream automation.',
      content: buildJsonSchema(`${titleize(agentId.replace(/-/g, '_'))}Output`, outputFields),
    },
    {
      path: `agents/${agentId}/evals/cases.yaml`,
      label: 'evals/cases.yaml',
      description: 'Starter evaluation cases for regression checks.',
      content: evalCases,
    },
    {
      path: `agents/${agentId}/evals/rubric.md`,
      label: 'evals/rubric.md',
      description: 'Rubric for judging template output quality.',
      content: rubric,
    },
    {
      path: `agents/${agentId}/changelog.md`,
      label: 'changelog.md',
      description: 'Version notes for the generated local template.',
      content: changelog,
    },
  ]

  return [
    buildBundleArtifact(`agents/${agentId}`, 'agent', agentId, form.name, form.version, artifacts),
    ...artifacts,
  ]
}

export function buildSkillArtifacts(form: SkillTemplateForm): TemplateArtifact[] {
  const whenToUse = splitLines(form.whenToUse)
  const whenNotToUse = splitLines(form.whenNotToUse)
  const inputs = splitLines(form.inputs)
  const outputs = splitLines(form.outputs)
  const procedure = splitLines(form.procedure)
  const qualityStandard = splitLines(form.qualityStandard)
  const failureModes = splitLines(form.failureModes)
  const dependencies = splitLines(form.dependencies)
  const invokableBy = splitLines(form.invokableBy)
  const tags = splitLines(form.tags)
  const requiredInputs = splitLines(form.requiredInputs)
  const optionalInputs = splitLines(form.optionalInputs)
  const qualityGates = splitLines(form.qualityGates)
  const inputFields = parseSchemaFields(form.inputSchemaFields, defaultSkillInputFields)
  const outputFields = parseSchemaFields(form.outputSchemaFields, defaultSkillOutputFields)
  const skillId = slugify(form.id)

  const skillMd = [
    '---',
    `id: ${skillId}`,
    `name: ${form.name}`,
    `version: ${form.version}`,
    `owner: ${form.owner}`,
    `status: ${form.status}`,
    `category: ${form.category}`,
    '---',
    '',
    '# 1. Purpose',
    form.purpose,
    '',
    '# 2. When To Use',
    formatMarkdownList(whenToUse),
    '',
    '# 3. When Not To Use',
    formatMarkdownList(whenNotToUse),
    '',
    '# 4. Inputs',
    formatMarkdownList(inputs),
    '',
    '# 5. Outputs',
    formatMarkdownList(outputs),
    '',
    '# 6. Procedure',
    procedure.length > 0 ? procedure.map((step, index) => `${index + 1}. ${step}`).join('\n') : '1. Fill in the procedure',
    '',
    '# 7. Quality Standard',
    formatMarkdownList(qualityStandard),
    '',
    '# 8. Failure Modes',
    formatMarkdownList(failureModes),
    '',
    '# 9. Dependencies',
    formatMarkdownList(dependencies),
    '',
    '# 10. Notes',
    form.notes,
  ].join('\n')

  const manifest = [
    `id: ${skillId}`,
    `name: ${quoteYaml(form.name)}`,
    `version: ${form.version}`,
    `description: ${quoteYaml(form.description)}`,
    'entry_file: SKILL.md',
    'input_schema: input.schema.json',
    'output_schema: output.schema.json',
    '',
    'tags:',
    formatYamlList(tags, 2),
    '',
    'invokable_by:',
    formatYamlList(invokableBy, 2),
    '',
    `timeout_seconds: ${Number.parseInt(form.timeoutSeconds, 10) || 120}`,
    `determinism: ${form.determinism}`,
    `side_effects: ${form.sideEffects === 'true' ? 'true' : 'false'}`,
    '',
    'requirements:',
    '  required_inputs:',
    formatYamlList(requiredInputs, 4),
    '  optional_inputs:',
    formatYamlList(optionalInputs, 4),
    '',
    `output_format: ${form.outputFormat}`,
    '',
    'quality_gates:',
    formatYamlList(qualityGates, 2),
  ].join('\n')

  const testsYaml = [
    'cases:',
    `  - id: ${skillId}_001`,
    `    title: ${quoteYaml(`${form.name} starter case`)}`,
    '    input_file: examples/input.example.json',
    '    expected:',
    '      must_include_sections:',
    ...formatYamlList(outputFields.filter((field) => field.required).map((field) => titleize(field.name)), 8).split('\n'),
  ].join('\n')

  const changelog = [
    '# Changelog',
    '',
    `## v${form.version}`,
    '- Initial engineering template scaffold generated from Template Studio.',
  ].join('\n')

  const artifacts: TemplateArtifact[] = [
    {
      path: `skills/${skillId}/SKILL.md`,
      label: 'SKILL.md',
      description: 'Primary skill documentation and usage contract.',
      content: skillMd,
    },
    {
      path: `skills/${skillId}/manifest.yaml`,
      label: 'manifest.yaml',
      description: 'Machine-readable skill metadata.',
      content: manifest,
    },
    {
      path: `skills/${skillId}/input.schema.json`,
      label: 'input.schema.json',
      description: 'Input contract for invoking this skill.',
      content: buildJsonSchema(`${titleize(skillId.replace(/-/g, '_'))}Input`, inputFields),
    },
    {
      path: `skills/${skillId}/output.schema.json`,
      label: 'output.schema.json',
      description: 'Output contract for consuming this skill.',
      content: buildJsonSchema(`${titleize(skillId.replace(/-/g, '_'))}Output`, outputFields),
    },
    {
      path: `skills/${skillId}/examples/input.example.json`,
      label: 'examples/input.example.json',
      description: 'Starter example payload for testing the skill.',
      content: buildExampleJson(inputFields),
    },
    {
      path: `skills/${skillId}/examples/output.example.md`,
      label: 'examples/output.example.md',
      description: 'Starter example output with placeholder sections.',
      content: buildSkillExampleMarkdown(form, outputFields),
    },
    {
      path: `skills/${skillId}/tests/cases.yaml`,
      label: 'tests/cases.yaml',
      description: 'Regression test starters for this skill.',
      content: testsYaml,
    },
    {
      path: `skills/${skillId}/changelog.md`,
      label: 'changelog.md',
      description: 'Version history for the generated local template.',
      content: changelog,
    },
  ]

  return [
    buildBundleArtifact(`skills/${skillId}`, 'skill', skillId, form.name, form.version, artifacts),
    ...artifacts,
  ]
}
