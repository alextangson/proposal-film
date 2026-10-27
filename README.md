# 用 AI 做求婚视频 · proposal-film

一部用 AI 做的求婚微电影，全片约 123 美元，她答应了。这个仓库把做法整理出来：**不会写代码的人拿两份模板就能开始**，会用 Claude Code / Codex 的人可以直接装上整套 skill。

## 🎁 领取物：两份模板（不用写代码）

| 模板 | 用来干嘛 |
|---|---|
| [① 挖故事提示词](templates/01-挖故事提示词.md) | 复制给任何 AI（ChatGPT、豆包、Kimi、Claude），它会一组一组地采访你，把你们的故事挖成素材清单和章节方案 |
| [② 分镜卡 + 人设卡模板](templates/02-分镜卡模板.md) | 把素材变成"时间 / 章节 / 画面"分镜卡，画面里用 → 写镜头内转场；附人设卡写法，保证全片人物长得一样 |

示例全部是虚构情侣（阿舟和小满），照着格式换成你们的故事就行。

## 这套做法的四条原则

1. **真事比创意重要。** 观众只有一个人，她认得出每一个细节。不编没发生过的事。
2. **视频只是台阶，真人才是落点。** 片子不替你说话，结尾停在一张静止的卡上，留给你开口。
3. **整首歌就是结构。** 不剪歌、不在歌里静音，章节跟着歌的段落走，关键动作卡在重拍上。
4. **转场要在画面里完成。** 一只手、一个物件、一道光把观众带到下一个画面；用"首尾帧接力"让 AI 在镜头里做出转场，不靠后期特效。

## 制作链路和花费（2026-10 实测）

| 环节 | 工具 | 价格 |
|---|---|---|
| 访谈、分镜、提示词 | Claude（或任何对话 AI） | 订阅内 |
| 首帧图 | ChatGPT / Codex 生图 | 订阅内 |
| 视频：首尾帧接力 | fal.ai 上的 Seedance 2.5，先出 480p 草稿 | 0.22 美元/秒 |
| 成片画质 | Topaz Starlight 超分到 1080p（不要重新生成 1080p） | 约 0.12 美元/秒 |
| 音效 | ElevenLabs 音效（fal.ai） | 0.002 美元/秒 |

全片约 123 美元：视频约 94，超分约 28.5，音效约 0.5。价格以 fal.ai 官网为准。

## 给 Claude Code / Codex 用户：安装 skill

```bash
git clone https://github.com/alextangson/proposal-film.git
cp -r proposal-film/skills/proposal-film ~/.claude/skills/              # Claude Code
cp -r proposal-film/templates ~/.claude/skills/proposal-film/             # 模板一起带上
# Codex：把上面两行的 ~/.claude/skills 换成 ~/.codex/skills
```

然后跟 AI 说"帮我做个求婚视频"。skill 里有：

- `SKILL.md`：做法总纲、最容易做坏的地方、五个必须停下来确认的闸口。
- `references/`：访谈怎么问、章节和转场怎么设计、制作流程和坑、一个匿名的完整案例（每一版被否了什么、为什么、怎么解决）。
- `scripts/fal.mjs`：零依赖的 fal.ai 小脚本，做 Seedance 首尾帧镜头、Topaz 超分、ElevenLabs 音效。提交前先报预估价，加 `--yes` 才真正花钱；不会覆盖已有文件；提交前先占住这一版，同一版不会被付两次钱，网络断了可以用 `request_id` 取回。
- `scripts/contact-sheet.sh`：用 ffmpeg 把镜头抽帧拼成一行、把首帧拼成故事板，方便检查人物是否一致、视线对不对。

运行脚本需要 Node 18+、ffmpeg，以及环境变量 `FAL_KEY`（在 [fal.ai](https://fal.ai/dashboard/keys) 申请，只放在环境变量里，不要写进文件）。

## 隐私

案例来自一部真实的求婚片。主角不愿以真实身份出现，所以仓库里没有任何真名、照片、日期和地点，案例里的情节也都做了泛化。你做自己的片子时也一样：真人照片只给生图工具当参考，不要上传到公开的地方。注意 `scripts/fal.mjs` 上传给 fal 的文件会得到一个公开链接，拿到链接的人都能打开，所以只传卡通首帧和生成出来的镜头。

---

## English

**proposal-film** — how to make a marriage-proposal short film with AI, from a real one that cost about US$123 (she said yes).

- `templates/`: two copy-paste templates in Chinese for any chat AI — an interview prompt that digs out your real story, and a storyboard card (time / chapter / picture, with in-shot transitions written as "→") plus a character sheet. All examples use a fictional couple.
- `skills/proposal-film/`: a Claude Code / Codex skill — principles, interview guide, story and transition design, production notes, an anonymised case study, and two small scripts (`fal.mjs` for Seedance 2.5 first/last-frame shots, Topaz upscaling and ElevenLabs sound effects on fal.ai; `contact-sheet.sh` for review sheets with ffmpeg).
- Core ideas: only true stories; the film is a step, the person is the landing; the whole song is the structure; transitions happen inside the shot.

Scripts need Node 18+, ffmpeg and a `FAL_KEY` environment variable. Never commit keys.

## License

[MIT](LICENSE)
