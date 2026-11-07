# Chrome Web Store listing

Everything the developer dashboard asks for. Copy each block as it is. Images are in [`store/`](../store). The package is the zip on the GitHub release; see [`RELEASING.md`](RELEASING.md).

## Store listing

**Name:** comes from the manifest: `Couplet: Learn Languages on YouTube`.

**Summary** (132 characters at most):

```text
Free dual subtitles for YouTube. Click a word for its meaning, save it, and review it in the sentence you heard it in.
```

**Category:** Education. **Language:** English.

**Description:**

```text
Couplet helps you learn a language from the videos you already watch. It shows the original above a translation, and turns every subtitle into something you can look up, keep, and review.

What you can do:
• Read both languages at once, with no need to turn on captions
• Click a word to see its meaning, phonetics, and example sentences, and hear it spoken
• Drag across a phrase to translate it
• Show the lines before and after, and select across them
• Save a word or phrase with its sentence and the moment you met it
• Review on a schedule, with a link back to that moment in the video
• See your streak, your progress, and what needs more practice
• Ask AI to explain a sentence, 50 times a day
• Export your list as a CSV

Choose from 8 languages to learn and 22 to translate into.

Subtitles and lookups work without an account. Saving and review need a Google sign-in, and your list syncs between your computers.

Your data: subtitle text is sent to Google Translate. What you look up or ask to explain goes through our server to an AI service run by Alibaba Cloud. We don't sell your data or show ads. Details are in the privacy policy.

Couplet is an independent product, and isn't affiliated with or endorsed by YouTube or Google.
```

**Traditional Chinese** (optional localization):

```text
摘要:在 YouTube 上同時看兩行字幕。點一下單字看意思,收藏後在當初聽到的句子裡複習。
```

```text
Couplet 讓你用平常就在看的影片學語言。原文和翻譯上下並排,每個字都可以查、可以存,之後還能複習。

你可以:
• 同時看原文和翻譯,不用開 CC
• 點單字看意思、音標和例句,也能聽發音
• 拖曳選取片語來翻譯,也可以跨上下句
• 顯示前後句
• 收藏單字,並保留當時的句子和影片時間點
• 依排程複習,可直接跳回影片當下
• 查看連續天數、進度,以及需要加強的單字
• 請 AI 解釋單字在句子裡的用法,每天 20 次
• 匯出成 CSV

學習語言 8 種,翻譯語言 22 種。

看字幕和查字不用帳號。收藏和複習要用 Google 登入,單字會在你的電腦之間同步。

你的資料:字幕文字會傳送到 Google 翻譯。你查的單字,以及要求解釋的句子,會經過我們的伺服器傳送到阿里雲的 AI 服務。我們不販售資料,也沒有廣告。詳情請見隱私權政策。

Couplet 是獨立產品,與 YouTube 或 Google 沒有任何關聯,也未獲其背書。
```

**Links:** homepage `https://coupletapp.com`, privacy policy `https://coupletapp.com/privacy/`. Leave the support URL empty until `support@coupletapp.com` receives mail.

## Images

| Dashboard field  | File                              | Size     |
| ---------------- | --------------------------------- | -------- |
| Store icon       | `public/icon/128.png`             | 128×128  |
| Screenshot 1     | `store/screenshot-0-youtube.jpg`  | 1280×800 |
| Screenshot 2     | `store/screenshot-1-welcome.jpg`  | 1280×800 |
| Screenshot 3     | `store/screenshot-2-words.jpg`    | 1280×800 |
| Screenshot 4     | `store/screenshot-3-review.jpg`   | 1280×800 |
| Screenshot 5     | `store/screenshot-4-progress.jpg` | 1280×800 |
| Spare            | `store/screenshot-5-home.jpg`     | 1280×800 |
| Small promo tile | `store/promo-small.jpg`           | 440×280  |
| Marquee promo    | `store/promo-marquee.jpg`         | 1400×560 |

The store icon is rendered from [`brand/store.svg`](../brand/store.svg), and the two promo images from [`brand/promo.html`](../brand/promo.html). Edit the sources, then run `node scripts/build-icons.mjs` and `node scripts/build-promo.mjs`; see [Logo in `DESIGN.md`](DESIGN.md#logo). Screenshot 2 shows the Welcome Page header, so retake it whenever the logo changes. The other screenshots show no logo.

The Dashboard screenshots use sample words and video titles. The YouTube screenshot shows a third-party channel's video, so replace it with a video you have the rights to show, or get the channel's permission.

## Privacy practices

**Single purpose:**

```text
Help people learn a language from YouTube videos, with dual subtitles, word lookup, and review of the words they save.
```

**Permission justifications:**

| Permission                                   | Justification                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                    | Saves the user's settings and sign-in session.                                                                             |
| `identity`                                   | Runs the Google sign-in window, which is needed to save and sync words.                                                    |
| `alarms`                                     | Syncs saved words in the background every few minutes.                                                                     |
| `unlimitedStorage`                           | Keeps the user's saved words, sentences, and review history on their device, which can exceed the default limit over time. |
| `https://translate.googleapis.com/*`         | Translates subtitle lines into the user's language.                                                                        |
| `https://api.coupletapp.com/*`               | Our service, which writes word lookups and AI explanations.                                                                |
| `https://www.youtube.com/*` (content script) | Reads subtitles and shows them, with lookup, on YouTube video pages. It runs on no other site.                             |

Sign-in and sync also reach Supabase. That needs no host permission, because its API allows cross-origin requests.

**Remote code:** No. All JavaScript is in the package. The services return data only.

**Data usage:** tick these, and leave the others unticked.

| Category                            | Why                                                               |
| ----------------------------------- | ----------------------------------------------------------------- |
| Personally identifiable information | Google account email and name                                     |
| Authentication information          | The sign-in session                                               |
| Location                            | The network address, hashed to count abuse for signed-out lookups |
| Website content                     | Subtitle lines, and saved sentences and video titles              |

**Certify all three:** data isn't sold to third parties, isn't used for purposes unrelated to the single purpose, and isn't used for creditworthiness or lending.

## Test instructions

Paste this in the dashboard's test instructions field:

```text
No test account is needed. Any Google account can sign in.

1. After install, the Welcome Page opens. Choose languages if you like. English as the learning language works with the video below.
2. Open https://www.youtube.com/watch?v=TwDJhUJL-5o and wait up to 15 seconds, after any ad, for the two lines of subtitles.
3. Click a word to see its Lookup Panel. Drag across several words to translate a phrase. No account is needed for these.
4. Press the star in the Lookup Panel, and sign in with Google from the prompt at the player's top right. The word is saved. A translated phrase has the same star.
5. Click the extension's toolbar icon, then Start review or Open Dashboard, to see Review, Words, and Progress.
6. In Words, open a word and press Explain with AI. It's limited to 50 a day per account.

Subtitles appear only on videos that have subtitles in the chosen learning language. The extension says so in its settings panel when a video has none.
```

## Before submitting

Review rejections usually come from these, by [the store's list of violations](https://developer.chrome.com/docs/webstore/troubleshooting):

| Violation                                 | How this listing avoids it                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Yellow Nickel, spam                       | Upload to the existing item for this extension. A second item with the same function counts as a duplicate     |
| Yellow Argon, keyword stuffing            | No word repeats more than five times in the description, and it names no competitors. Recount after editing it |
| Yellow Magnesium, not working             | Test instructions name a video that has subtitles. Test the same zip that you upload                           |
| Purple Potassium, permissions             | Every permission above is in use                                                                               |
| Purple Lithium and Purple Nickel, privacy | The policy is in the dedicated field, and the listing and Welcome Page both state where data goes              |
| Red Nickel, deceptive                     | The listing says the product is not affiliated with YouTube or Google                                          |

After the first upload, check that the store's ID is `pnjdidlglcbbnfhcnhmhndoakdphhckj`, or Google sign-in will fail. See [`RELEASING.md`](RELEASING.md).
