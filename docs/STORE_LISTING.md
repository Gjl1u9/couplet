# Chrome Web Store listing

Everything the developer dashboard asks for. Copy each block as it is. Images are in [`store/`](../store). The package is the zip on the GitHub release; see [`RELEASING.md`](RELEASING.md).

## Store listing

**Name and summary:** come from [`public/_locales`](../public/_locales), through the manifest, so the dashboard can't edit them. Changing them takes a new package.

**Category:** Education. **Language:** English.

**Description:**

```text
Learn a language from the YouTube videos you already watch. Couplet shows dual subtitles, gives you the meaning of any word you click, and brings saved words back in the sentence you heard them in. Free to use.

WATCH WITH DUAL SUBTITLES
• See the original above your language, with no need to turn on captions
• Works on videos with subtitles, including auto-generated ones
• Move and resize the subtitles, or show the lines before and after
• Hide the translation to test yourself
• Learning English? One new term per line, picked for your level, gets a dashed underline

LOOK UP WITHOUT LEAVING THE VIDEO
• Click a word for its meaning, phonetics, and example sentences
• Hear it spoken
• Drag across a phrase to translate it, even across two lines
• The video can pause while you read
• Already know it? Mark it, and it's never underlined or reviewed

KEEP WHAT YOU MEET
• Save a word or phrase with one click
• Each one keeps its sentence, the lines around it, and the moment in the video
• Your list syncs between your computers, and exports as a CSV

REVIEW IN CONTEXT
• Saved words come back on a schedule, from ten minutes to two months
• One click returns to the exact moment in the video
• See your streak, your progress, and what needs more practice

ASK AI WHEN A SENTENCE STAYS UNCLEAR
• From the lookup card or your list, get two or three sentences on meaning and grammar
• 50 explanations a day

LANGUAGES
Learn English, Spanish, French, German, Portuguese, Italian, Japanese, or Korean, with translations into 22 languages.

ACCOUNT AND PRIVACY
Watching and looking up work without an account. To save and review, sign in with Google.

We don't sell your data or show ads. Subtitles go to Google Translate, and lookups and AI explanations are handled by Alibaba Cloud's AI service. See the privacy policy for details.

Couplet is an independent product, not affiliated with YouTube or Google.
```

**Traditional Chinese description:** the dashboard's Language menu lists each locale in `public/_locales` once a package with it is uploaded. Choose Traditional Chinese, and paste this:

```text
用你平常就在看的 YouTube 影片學語言。Couplet 提供雙字幕，點一下單字就看到意思，收藏後還會在當初聽到的句子裡複習。免費使用。

看影片，同時看雙字幕
• 原文和翻譯上下並排，不用開 CC
• 有字幕的影片都能用，包括自動產生的字幕
• 字幕可以移動、調整大小，也能顯示前後句
• 想測試自己時，可以隱藏翻譯
• 學英文的話，每行會用虛線標出一個適合你程度的新字

不離開影片就能查
• 點單字看意思、音標和例句
• 可以聽發音
• 拖曳選取片語來翻譯，也可以跨兩行
• 查字時影片可以自動暫停
• 已經會的字按「I know this」，就不再標出或複習

把遇到的字留下來
• 一鍵收藏單字或片語
• 保留當時的句子、前後句和影片時間點
• 單字會在你的電腦之間同步，也能匯出成 CSV

在原本的情境裡複習
• 收藏的字會依排程回來，間隔從十分鐘到兩個月
• 一鍵跳回影片當下
• 查看連續天數、進度，以及需要加強的單字

句子還是看不懂，就問 AI
• 在字卡或單字清單裡，用兩三句話說明意思和文法
• 每天 50 次

語言
可以學英文、西班牙文、法文、德文、葡萄牙文、義大利文、日文和韓文，翻譯語言有 22 種。

帳號與隱私
看字幕和查字不用帳號。想收藏和複習，用 Google 登入就好。

我們不賣資料，也沒有廣告。字幕會傳到 Google 翻譯，查字和 AI 解釋由阿里雲的 AI 服務處理，詳見隱私權政策。

Couplet 是獨立產品，與 YouTube 和 Google 沒有關聯。
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
6. In the Lookup Panel, or in Words after opening a word, press Explain with AI. It's limited to 50 a day per account.

Subtitles appear on videos that have subtitles. A video without the learning language shows its own language with a translation, a video in the native language keeps YouTube's own subtitles, and the extension says so when a video has none.
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
