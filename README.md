# 心屿 · Xinyu

一座安放心绪的小岛：涨知识（心理学干货科普）、缓情绪（深夜 emo 有处可去）、认识自己（大五人格测评）。

- **面向人群**：普通大众，尤其深夜刷手机刷到焦虑的大学女生
- **调性**：温暖治愈（奶油底 + 蜜桃橙 + 雾绿，圆角、留白、字体温柔）
- **技术路线**：纯 HTML + CSS + 原生 JS（不碰框架）；收藏 / 心情记录 / 测评结果全存浏览器本地（localStorage），不登录、不要服务器
- **上线方式**：GitHub Pages 免费部署

## 当前状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| Day 2 | 仓库初始化、占位首页、忽略规则 | ✅ 已完成 |
| Day 3 | 需求研究：3 个类似产品比较 +「本期不做」清单 → `research.md` | ✅ 已完成 |
| Day 4 | 产品需求文档：功能清单 + 验收标准 → `PRD.md`（自检报告见 `PRD-自检报告.md`） | ✅ 已完成 |
| Day 5 | 技术选型 | 待做 |
| Day 7 | 网站 MVP 动工 | 待做 |
| Day 14-16 | 呼吸练习 / 安慰卡 / 本地收藏 | 待做 |
| Day 19-20 | 部署 GitHub Pages 上线 | 待做 |

## 项目结构

```
心屿/
├── index.html          # 占位首页（Day 2）
├── research.md         # 需求研究（Day 3）：产品比较、不做清单、第一版范围
├── PRD.md              # 产品需求文档（Day 4）：6 项功能 + 验收标准 + 不做清单
├── PRD-自检报告.md     # 按验收标准的 AI 自检结论（Day 4）
├── .gitignore          # 忽略规则（保护 .env、密钥、数据库等）
└── .env                # 本地配置文件（已被忽略，永不上传）
```

## 把项目保存到 GitHub：逐步清单

> 每步说明：在哪个文件夹执行 → 命令做什么 → 成功时看到什么。
> 第 1 步在网页上做，第 2 步起在「心屿」文件夹里做。你只需要做第 1 步和浏览器授权，其余可以交给 AI 秘书代办。

### 第 1 步 · 在 GitHub 网页上创建空仓库

- **在哪**：浏览器，已登录 github.com（用户名 XingHo-VibeCoding）
- **做什么**：右上角「+」→ New repository → 仓库名填 `PsyIsle` → 选 Public → **三个勾都不勾**（README / .gitignore / license 都不要，本地已有）→ Create repository
- **成功看到**：一个空的仓库页面，上面出现仓库地址 `https://github.com/XingHo-VibeCoding/PsyIsle.git`

### 第 2 步 · 告诉 Git 你的身份（已配置好，仅首次需要）

- **在哪**：`C:\Users\24486\Desktop\工作台\心屿`（或任何位置，因为是全局配置）
- **做什么**：
  ```
  git config --global user.name  "XingHo-VibeCoding"
  git config --global user.email "2448686238@qq.com"
  ```
- **成功看到**：命令没有任何输出，安静 = 成功。可用 `git config --global --list` 查看

### 第 3 步 · 把文件夹变成 Git 仓库（已执行）

- **在哪**：`C:\Users\24486\Desktop\工作台\心屿`
- **做什么**：
  ```
  git init
  ```
- **成功看到**：`Initialized empty Git repository in .../.git/`，文件夹里多出一个隐藏的 `.git` 文件夹

### 第 4 步 · 打包并存档（已执行）

- **在哪**：`心屿` 文件夹
- **做什么**：
  ```
  git add .                # 把改动放进"暂存清单"
  git commit -m "Day 2｜心屿建仓"   # 把清单内容正式存档
  ```
- **成功看到**：commit 输出会显示分支名 `main`、提交编号（如 `d105803`）和「2 files changed」；用 `git log --oneline` 能看到提交记录

### 第 5 步 · 连接远程仓库并上传（等仓库建好后执行）

- **在哪**：`心屿` 文件夹
- **做什么**：
  ```
  git remote add origin https://github.com/XingHo-VibeCoding/PsyIsle.git
  git push -u origin main
  ```
- **成功看到**：首次 push 会弹浏览器让你登录 GitHub 并点「Authorize」授权；命令行出现 `Branch 'main' set up to track remote branch 'main'` 即成功

### 第 6 步 · 回网页验收

- **在哪**：浏览器刷新 `https://github.com/XingHo-VibeCoding/PsyIsle`
- **成功看到**：`index.html`、`.gitignore`、`README.md` 三个文件躺在仓库首页，`.env` **不在**列表里（说明忽略规则生效）；点进提交记录能看到「Day 2」开头的提交。这个页面就是交作业的截图对象

### 以后的日常节奏（三板斧）

改完文件后，每次都是同样三步：

```
git add .        # 改动进清单
git commit -m "Day N｜这次干了啥"   # 存档
git push         # 存档上云
```

## 不该上传的文件（.gitignore 已自动拦截）

| 类别 | 例子 | 为什么 |
|---|---|---|
| 环境配置 | `.env` | 以后第 23 天存数据库地址和密码 |
| 密钥证书 | `*.pem` `*.key` | 泄露等于把家门钥匙挂上公网 |
| 依赖目录 | `node_modules/` | 体积巨大，有 package.json 就能重装 |
| 本地数据库 | `*.db` `*.sqlite` | 本地测试数据，不属于源代码 |
| 日志/系统/编辑器 | `*.log` `.DS_Store` `.vscode/` | 杂物，无共享价值 |
