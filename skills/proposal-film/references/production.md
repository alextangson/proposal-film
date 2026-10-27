# 制作流程、工具和坑

一部片一个目录。建议的结构：

```
my-film/
  kf/            首帧和尾帧图（C01-start.png、C01-end.png ……），以及 people.md（人设卡）、style.md（画风说明）
  prompts/       每个镜头一份提示词（C01.txt ……）
  clips/         Seedance 生成的镜头，每一版单独命名：C01-t1.mp4、C01-t2.mp4
  clips/up/      超分后的 1080p 版本
  music/         歌曲（mp3）和节拍表
  sfx/           音效
  shots.md       分镜卡 + 剪辑清单：每个镜头用哪一版、起点、倍率
  requests.jsonl 每一次付费请求的记录（scripts/fal.mjs 自动写）
```

需要的东西：Node 18+、ffmpeg、一个 fal.ai 账号和它的 API key（放在环境变量 `FAL_KEY` 里，不要写进任何文件）、一个能生图的工具（ChatGPT / Codex 生图、Midjourney 之类都行）。剪辑和代码渲染的段落按片子写，下一部片复制过来改，不要试图做成通用工具。

## 1. 人设和画风

- 人设写成一个文本文件（`kf/people.md`，写法见 `templates/02-分镜卡模板.md` 的人设卡部分），写清：身材（瘦高、微胖要写明，并写"不是什么"）、发型、标志物（项链、眼镜）、主角之间的身高差。每次生图都附上这个文件；你的生图工具支持参考图的话，再附上真人照片。真人照片只喂给生图工具，不要传到 fal：`scripts/fal.mjs` 上传的文件会得到一个公开链接，拿到链接的人都能打开。
- 画风让用户选：同一个场景出 4 种画风对比，用户给的截图直接当风格参考图。案例的分工是：蜘蛛侠平行宇宙那种"漫画活过来"的风格负责主线和抒情，皮克斯风负责日常和搞笑，纸面印刷漫画负责开场、真实照片和结尾。画风说明里写清"借它的质感，不要复制任何角色、服装和标志"。
- **首帧用风格还原好的生图工具出。** 案例用的是 Codex（ChatGPT 的图像生成），同样的 brief 换成另一个模型后风格还原差很多。多张图可以按章节拆成几路并行；每张 brief 都附上一张已经定稿的锚点图，保证整片风格一致。
- **脸必须是卡通脸。** 写实的脸，尤其是照着真人照片画的配角，会被 fal 上 Seedance 的审核拒掉（`partner_validation_failed`）。被拒的请求不扣费，但要重画。
- 每批首帧拼成故事板（按播放顺序、带编号），自己先查一遍再给用户：人物身材、服装连续性（同一场戏的睡衣要一样）、肢体有没有变形、视线方向对不对（回头要看向对方）。

  ```bash
  scripts/contact-sheet.sh board kf/C*-start.png     # 输出 storyboard-1.jpg，已有就顺延编号
  ```

## 2. 视频：Seedance 2.5 首尾帧接力

- 接口：fal 上的 `bytedance/seedance-2.5/image-to-video`，传首帧 `image_url` 和尾帧 `end_image_url`，时长 4–30 秒的整数。**上一个镜头的尾帧就是下一个镜头的首帧**，这样剪辑时直接硬接，转场在镜头里完成。
- 提示词的写法：先写"One continuous shot with no cuts; the camera move carries us from the first frame to the last frame."，再写画面里发生的动作和转场，最后附上画风和人设的一段固定文字（比如"faces stay stylised cartoon faces"）。要求精确的动作（比如"他的手先动"）时，**一个镜头只做一件事**：手的戏和转场分成两个镜头。
- 先出 480p 草稿，约 0.22 美元每秒：

  ```bash
  export FAL_KEY=...            # 只放在环境变量里
  node scripts/fal.mjs shot --first kf/C01-start.png --last kf/C01-end.png \
    --prompt prompts/C01.txt --duration 6 --res 480p --out clips/C01-t1.mp4          # 先看预估价
  node scripts/fal.mjs shot ... --out clips/C01-t1.mp4 --yes                          # 确认后提交
  ```

- **版本陷阱**：重新生成的镜头要换新名字（`-t2`、`-t3`），然后在 `shots.md` 里改成用新的那一版。剪辑前核对一遍：每个镜头有没有更新的版本没被用上。案例里因为这个问题，被否掉的旧镜头回到了片子里。
- 网络断了或者超时：脚本在付费提交前会先占住这一版（`clips/C01-t1.mp4.pending.json`），拿到 `request_id` 后写进这个文件和 `requests.jsonl`；这时再跑同一个 `--out` 会被拒绝，不会重复扣钱。用 `node scripts/fal.mjs fetch --endpoint bytedance/seedance-2.5/image-to-video --request-id <id> --out clips/C01-t1.mp4` 取回结果，或者去 fal 后台查。
- 卡顿检查：镜头首尾常有静止段，这不算卡顿，剪掉就行；重复帧分布在镜头中间的才是真卡顿，要重出。
- 检查方式：每个镜头均匀抽 7–8 帧拼成一行，逐条对照转场设计验收。

  ```bash
  scripts/contact-sheet.sh clip clips/C01-t1.mp4 8
  ```

## 3. 按歌剪辑

- 歌曲文件先解码检查（`ffmpeg -v error -i song.flac -f null -`，有报错就换 mp3）。测出 BPM 和每小节的起点，存成节拍表。
- 剪辑规则：
  - 首尾帧接力的镜头只剪掉头尾的静止段，整体匀速调速，倍率 0.8–1.4；**不要从中间删帧**，会破坏接力。
  - 独立的片段（比如相册里的回忆）可以随意剪。
  - 锚点（手扣上、梦醒、问号）误差不超过一帧。
- 输出审片图：每秒一帧的总览；每个接缝前后两帧并排；一张镜头表（起点、帧数、倍率）。
- 用剪映、Premiere、DaVinci 手动剪完全可以；想用代码剪，就让 AI 按上面的规则写一个 Python + ffmpeg 脚本，时间线以节拍表为准。

## 4. 用代码渲染的段落

案例里的纸面漫画开场、相册蒙太奇、真实照片漫画页、梦境溶成真实照片、结尾卡，都是用 Python（PIL / numpy）逐帧画出来，再交给 ffmpeg 编码。好处是字和版式完全可控，真实照片也不用经过 AI 生成。印刷质感的做法：干净的网点、小幅错版、不用模糊。有些 ffmpeg 版本没有 drawtext 滤镜，文字都用 PIL 画最稳。不会写代码的话，这几段也可以在剪辑软件里用照片和字幕做。

## 5. 音效

- 用 ElevenLabs 生成：fal 上的 `fal-ai/elevenlabs/sound-effects/v2`，0.002 美元每秒，案例里约 60 个音效一共约 0.5 美元。

  ```bash
  node scripts/fal.mjs sfx --text "rain on a window at night heard from indoors, steady" --seconds 10 --loop --out sfx/rain.mp3 --yes
  ```

- 提示词写具体的声源和距离，环境音结尾加 "no clear speech"，避免生成出人声。
- 音量：环境音比音乐低 18–22 dB，点缀音效低 10–14 dB；每个音效都加 50–150 ms 的淡入淡出。不配任何人声。
- **AI 生成的环境音常带 50Hz 电源嗡声和高频嘶声**，用户会听成"电流麦"。混音前统一清理：去掉 50/100/150/200 Hz 的嗡声；环境音加 120 Hz 高通、降噪和 11 kHz 低通。纯底噪类的音效（房间底噪）直接别用，安静段落只留音乐。
- 最后检查：逐段对比音乐和音效的音量差，并逐个听一遍音效有没有嗡声。

## 6. 成片画质：超分，不重新生成

- 用 Topaz Starlight Precise 2.6（fal 上的 `topaz/upscale/video/generative`，`upscale_factor` 2.25，案例里约 0.12 美元每秒）把用户认可的 480p 镜头放大到 1080p：

  ```bash
  node scripts/fal.mjs upscale --video clips/C01-t3.mp4 --factor 2.25 --out clips/up/C01-t3.mp4 --yes
  ```

- 不要用 Seedance 重新生成 1080p：约 1.16 美元每秒，贵 10 倍左右，而且出来的画面和用户认可的不一样。
- 先拿一个镜头对比几种超分模型（Topaz 的 Proteus 和 Starlight），案例里 Starlight 明显更清晰，人脸也没有走样。

## 7. 交付

- 1920×1080、24fps、H.264；响度 -16 LUFS，按 AAC 编码后的真峰值检查。
- 结尾卡在音乐结束后静止几分钟（在电视上放）；发给别人看的版本停几秒再淡出。
- 让用户在实际放映的电视上用实际的方式试播一遍：画面比例、音量、结尾卡能不能一直停住、会不会弹出播放器菜单。

## 价格参考（2026-10，以 fal 官网为准）

| 环节 | 价格 |
|---|---|
| Seedance 2.5 480p | 0.22 美元/秒 |
| Seedance 2.5 1080p | 1.16 美元/秒 |
| Topaz Starlight 超分 | 约 0.12 美元/秒 |
| ElevenLabs 音效 | 0.002 美元/秒 |
| 首帧生图 | 看你用的工具；案例用 ChatGPT 订阅自带的生图，不另外计费 |

案例全片约 123 美元：Seedance 约 94（来回改了很多版），超分约 28.5，音效约 0.5。用户事先接受的预算是 250–300 美元。
