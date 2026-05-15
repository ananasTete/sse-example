# Requirements Document

## Introduction

重新设计和实现基于 TipTap 的剧本编辑器自定义节点系统。该系统包含七种剧本节点类型（场次、动作、角色、对话、转场、注释、字幕），每种节点具有独立的编辑行为、气泡菜单交互和节点间流转逻辑。项目使用 TipTap v3、React 19、TypeScript、Tailwind CSS 4 和 @floating-ui/react。

## Glossary

- **Editor**: 基于 TipTap v3 的富文本编辑器实例
- **SceneHeading_Node**: 场次节点，表示剧本中一个场次的标题行，包含序号、地点、时间和内外景信息
- **Action_Node**: 动作节点，表示剧本中的场景描述和动作描写
- **Character_Node**: 角色节点，表示对话前的角色名称标识
- **Dialogue_Node**: 对话节点，表示角色的台词内容
- **Transition_Node**: 转场节点，表示镜头转换方式
- **Note_Node**: 注释节点，表示编剧的备注信息
- **Subtitle_Node**: 字幕节点，表示画面上显示的字幕文本
- **Bubble_Menu**: 气泡菜单，点击节点内特定元素时弹出的浮动选择面板
- **Location_Menu**: 地点气泡菜单，用于选择或创建场次地点
- **Time_Menu**: 时间气泡菜单，用于选择场次时间
- **IntExt_Menu**: 内外景气泡菜单，用于选择内景或外景
- **Character_Menu**: 角色气泡菜单，用于选择或创建角色名称
- **Transition_Menu**: 转场气泡菜单，用于选择转场方式
- **Sequence_Number**: 场次序号，自动计算的场次编号

## Requirements

### 需求 1：场次节点结构

**用户故事：** 作为编剧，我想要一个结构化的场次标题节点，以便清晰地标识每个场次的地点、时间和内外景信息。

#### 验收标准

1. THE SceneHeading_Node SHALL 渲染为包含序号和三个可选菜单元素（Location、Time、IntExt）的块级节点
2. THE SceneHeading_Node SHALL 在节点最左侧显示自动计算的 Sequence_Number，格式为 "N."（N 为从 1 开始的整数）
3. THE Editor SHALL 禁止用户直接编辑 Sequence_Number 的文本内容
4. WHEN 文档中 SceneHeading_Node 的顺序发生变化（插入、删除或移动），THE Editor SHALL 重新计算所有 SceneHeading_Node 的 Sequence_Number 使其保持连续递增
5. THE SceneHeading_Node SHALL 在 Time 菜单元素和 IntExt 菜单元素之间显示一个不可编辑的 "/" 分隔符

### 需求 2：地点气泡菜单

**用户故事：** 作为编剧，我想要通过气泡菜单快速选择或创建场次地点，以便高效地管理剧本中的场景位置。

#### 验收标准

1. WHEN 用户点击 SceneHeading_Node 中的 Location 元素，THE Location_Menu SHALL 显示一个气泡菜单面板
2. WHEN Location_Menu 打开时，THE Location_Menu SHALL 将光标默认聚焦到输入框中
3. THE Location_Menu SHALL 显示文本提示"按 Tab 切换到时间"
4. THE Location_Menu SHALL 收集并显示当前文档中所有 SceneHeading_Node 已有的 location 值列表
5. WHEN Location_Menu 打开时，THE Location_Menu SHALL 默认选中列表中的第一个 location 项
6. WHEN 用户按下键盘上下方向键，THE Location_Menu SHALL 在 location 列表中切换选中项
7. WHEN 用户按下回车键，THE Location_Menu SHALL 确认当前选中的 location 值并关闭菜单
8. WHEN 用户在输入框中输入的文本与已有 location 列表中的任何项都不匹配，THE Location_Menu SHALL 将列表替换为"创建 xxx"提示（xxx 为当前输入内容）
9. WHEN 用户按下 Tab 键，THE Location_Menu SHALL 关闭并打开 Time_Menu

### 需求 3：时间气泡菜单

**用户故事：** 作为编剧，我想要通过下拉菜单快速选择场次时间，以便标准化时间描述。

#### 验收标准

1. WHEN 用户点击 SceneHeading_Node 中的 Time 元素，THE Time_Menu SHALL 显示一个气泡下拉菜单
2. THE Time_Menu SHALL 提供以下固定选项：日、夜、午、晨、暮、接续、稍后、片刻后、同时
3. WHEN Time_Menu 打开时，THE Time_Menu SHALL 默认选中第一个选项
4. WHEN 用户按下键盘上下方向键，THE Time_Menu SHALL 在选项列表中切换选中项
5. WHEN 用户按下回车键，THE Time_Menu SHALL 确认当前选中的选项并关闭菜单

### 需求 4：内外景气泡菜单

**用户故事：** 作为编剧，我想要通过下拉菜单快速选择内外景类型，以便标准化场景描述。

#### 验收标准

1. WHEN 用户点击 SceneHeading_Node 中的 IntExt 元素，THE IntExt_Menu SHALL 显示一个气泡下拉菜单
2. THE IntExt_Menu SHALL 提供以下固定选项：内、外、内/外、外/内
3. WHEN IntExt_Menu 打开时，THE IntExt_Menu SHALL 默认选中第一个选项
4. WHEN 用户按下键盘上下方向键，THE IntExt_Menu SHALL 在选项列表中切换选中项
5. WHEN 用户按下回车键，THE IntExt_Menu SHALL 确认当前选中的选项并关闭菜单

### 需求 5：动作节点

**用户故事：** 作为编剧，我想要一个统一的动作节点来描写场景和动作，以便简化节点类型并提高编辑效率。

#### 验收标准

1. THE Action_Node SHALL 合并原有的 Scene 节点和 Action 节点为单一节点类型
2. THE Action_Node SHALL 允许用户自由输入文本内容
3. WHEN 用户在 Action_Node 中按下回车键，THE Editor SHALL 创建一个新的 Action_Node 作为下一个节点

### 需求 6：角色节点与角色菜单

**用户故事：** 作为编剧，我想要通过气泡菜单快速选择或创建角色，以便高效地管理对话中的角色标识。

#### 验收标准

1. WHEN 用户通过斜杠命令或其他方式切换到 Character_Node，THE Character_Menu SHALL 立即自动弹出
2. WHEN Character_Menu 打开时，THE Character_Menu SHALL 将光标默认聚焦到输入框中
3. THE Character_Menu SHALL 收集并显示当前文档中所有 Character_Node 已有的角色名称列表
4. WHEN Character_Menu 打开时，THE Character_Menu SHALL 默认选中列表中的第一个角色项
5. WHEN 用户按下键盘上下方向键，THE Character_Menu SHALL 在角色列表中切换选中项
6. WHEN 用户按下回车键选择已有角色，THE Character_Menu SHALL 确认选中的角色名称、关闭菜单并自动将光标移动到下一个 Dialogue_Node
7. WHEN 用户在输入框中输入的文本与已有角色列表中的任何项都不匹配，THE Character_Menu SHALL 将列表替换为"创建 xxx"提示（xxx 为当前输入内容）
8. WHEN 用户确认创建新角色，THE Character_Menu SHALL 将新角色名称设置到 Character_Node 并自动将光标移动到下一个 Dialogue_Node

### 需求 7：对话节点

**用户故事：** 作为编剧，我想要一个自由输入的对话节点，以便编写角色台词。

#### 验收标准

1. THE Dialogue_Node SHALL 允许用户自由输入文本内容
2. WHEN 用户在 Dialogue_Node 中按下回车键，THE Editor SHALL 创建一个新的 Character_Node 作为下一个节点

### 需求 8：转场节点

**用户故事：** 作为编剧，我想要一个转场节点来标识镜头转换方式，以便清晰地表达场景之间的过渡效果。

#### 验收标准

1. THE Transition_Node SHALL 将文本内容右对齐显示
2. WHEN 用户点击 Transition_Node 或通过斜杠命令切换到 Transition_Node，THE Transition_Menu SHALL 自动弹出
3. THE Transition_Menu SHALL 提供以下固定选项：切至、淡出至、溶解至、淡入、淡出、跳切至、匹配至、跳跃至
4. WHEN Transition_Menu 打开时，THE Transition_Menu SHALL 默认选中第一个选项
5. WHEN 用户按下键盘上下方向键，THE Transition_Menu SHALL 在选项列表中切换选中项
6. WHEN 用户按下回车键，THE Transition_Menu SHALL 确认当前选中的选项并关闭菜单

### 需求 9：注释节点

**用户故事：** 作为编剧，我想要一个注释节点来添加备注信息，以便在剧本中记录创作思路而不影响正式内容。

#### 验收标准

1. THE Note_Node SHALL 使用与 Markdown blockquote 相同的视觉样式渲染（左侧竖线边框、缩进、斜体文字颜色）
2. THE Note_Node SHALL 允许用户自由输入文本内容

### 需求 10：字幕节点

**用户故事：** 作为编剧，我想要一个字幕节点来标识画面上显示的文字，以便区分字幕内容和其他剧本元素。

#### 验收标准

1. THE Subtitle_Node SHALL 将文本内容左对齐显示，并在左侧保留 32px 的内边距
2. THE Subtitle_Node SHALL 将文本内容以加粗和斜体样式渲染
3. THE Subtitle_Node SHALL 允许用户自由输入文本内容

### 需求 11：节点间流转与斜杠命令集成

**用户故事：** 作为编剧，我想要通过斜杠命令在不同节点类型之间切换，以便灵活地组织剧本结构。

#### 验收标准

1. THE Editor SHALL 在斜杠命令菜单中提供所有七种剧本节点类型的切换选项（场次、动作、角色、对话、转场、注释、字幕）
2. THE Editor SHALL 移除原有的 Scene 节点类型，仅保留 Action_Node 作为场景描述节点
3. WHEN 用户在 SceneHeading_Node 中按下回车键，THE Editor SHALL 创建一个新的 Action_Node 作为下一个节点

### 需求 12：气泡菜单通用交互规范

**用户故事：** 作为编剧，我想要所有气泡菜单具有一致的交互体验，以便降低学习成本。

#### 验收标准

1. WHEN 用户按下 Escape 键，THE Bubble_Menu SHALL 关闭当前打开的气泡菜单
2. WHEN 用户点击气泡菜单外部区域，THE Bubble_Menu SHALL 关闭当前打开的气泡菜单
3. THE Bubble_Menu SHALL 使用 @floating-ui/react 进行浮动定位，确保菜单不超出视口边界
