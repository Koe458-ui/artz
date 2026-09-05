window.ZEO_DATA = {
  welcomeMessage: "Hi, I'm Zeo — your DigiArtz assistant. Tell me what you need and I'll walk you through it one step at a time. Pick an option to begin.",

  welcomeOptions: [
    { id: "helpCenter",  label: "🧭 Get Help" },
    { id: "cat_contact", label: "✉️ Contact a Human" }
  ],

  helpCenterMessage: "What do you need help with? Choose a topic and I'll ask a couple of quick questions to get you to the right answer.",

  categories: [
    { id: "about",     icon: "💠", label: "About DigiArtz",        description: "What this place is and who made it.",       prompt: "What would you like to know about DigiArtz?" },
    { id: "navigation",icon: "🧭", label: "Getting Around",         description: "Find your way and reach any section.",       prompt: "What are you trying to find or reach?" },
    { id: "account",   icon: "🔑", label: "Account & Login",        description: "Sign up, log in, passwords, sign-out.",      prompt: "What's happening with your account?" },
    { id: "profile",   icon: "👤", label: "Profile & Customizing",  description: "Avatar, banner, bio, links, username.",      prompt: "What do you want to change on your profile?" },
    { id: "upload",    icon: "🎨", label: "Uploading Art",          description: "Post art, checks, multi-image, tags.",     prompt: "What do you need help with for your artwork?" },
    { id: "moderation",icon: "✅", label: "Upload Checks & Rejections", description: "Why a piece failed the check and how to fix it.", prompt: "What did the checker say about your upload?" },
    { id: "gallery",   icon: "🖼️", label: "Viewing & Interacting",  description: "Download, share, like, comment, report.",    prompt: "What would you like to do with an artwork?" },
    { id: "resources", icon: "🧰", label: "Resources",              description: "Brushes, textures, fonts, 3D, templates.",     prompt: "What do you need help with in Resources?" },
    { id: "blog",      icon: "📝", label: "Blog",                   description: "Write and read community posts.",             prompt: "What would you like to do on the Blog?" },
    { id: "marketplace",icon:"🛍️", label: "Marketplace",            description: "Buy and sell downloads, commissions, services.", prompt: "What do you need help with in the Marketplace?" },
    { id: "jobs",      icon: "💼", label: "Jobs",                   description: "Post a role or apply to one.",                prompt: "Are you hiring, or looking for work?" },
    { id: "cart",      icon: "🛒", label: "Cart & Orders",          description: "Purchases, downloads and licenses.",          prompt: "What do you need from your Cart?" },
    { id: "community", icon: "💬", label: "Community & Chat",       description: "Communities, comments, and messages.",       prompt: "Which part of the community do you need help with?" },
    { id: "billing",   icon: "💎", label: "Subscriptions & Billing", description: "Plans, payments, cancelling.",               prompt: "What are you facing with billing or your plan?" },
    { id: "policies",  icon: "⚖️", label: "Policies & Legal",       description: "Privacy and Terms.",                          prompt: "Which policy would you like a quick summary of?" },
    { id: "safety",    icon: "🚩", label: "Safety & Reporting",     description: "Report content, harassment, stolen art.",    prompt: "What safety issue can I help with?" },
    { id: "trouble",   icon: "🛠️", label: "Technical Problems",     description: "Loading, saving, and display issues.",       prompt: "What's going wrong?" },
    { id: "contact",   icon: "✉️", label: "Contact a Human",        description: "Reach the DigiArtz team directly.",          prompt: "How would you like to reach us?" }
  ],

  responses: {
    about: [
      {
        question: "What is DigiArtz?",
        answer:
`DigiArtz is a place for digital artists to share their work, build a portfolio and meet other artists.

• Browse art — characters, cars, landscapes and more
• Create a free account to post your own work
• Like, comment, and message other artists
• Follow the motto: "Art Has No Limits"

Head to the Home tab any time to start exploring.`
      },
      {
        question: "Who created DigiArtz?",
        answer:
`DigiArtz is built and run by the DigiArtz team.

It is a place for digital artists anywhere to put their work up and have people see it.`
      },
      {
        question: "Is it free to use?",
        answer:
`Yes — DigiArtz is free to browse and to post your art.

1. Tap Profile in the top bar
2. Create a free account (or log in)
3. Start uploading and interacting

Optional paid subscription tiers add extra perks — see the "Subscriptions & Billing" topic for details.`
      },
      {
        question: "What can I do here?",
        answer:
`Here's what you can do on DigiArtz:

1. Browse art under Explore → Artworks
2. Open any piece to download, share, like or comment
3. Post your own with Upload → Upload Artwork in the top bar
4. Follow artists and read your Following feed
5. Join Communities and chat with other artists
6. Message friends directly (DMs)

Pick any of those topics from the menu and I'll guide you.`
      }
    ],

    navigation: [
      {
        question: "What is in the top bar?",
        answer:
`The bar across the top is the main menu. On a phone the words live behind the ☰ button; from a wide screen they sit on the bar itself.

• Explore — opens a menu of the five sections: Artworks, Marketplace, Blog, Resources and Jobs
• Communities — topic rooms you can join or create
• Friends — your friends, your messages, and me
• Upload — opens a menu of the five things you can post
• Profile — your account, uploads and settings (it says Sign in until you have one)

Beside those: 🔍 search, 🔔 notifications and 🛒 your cart.`
      },
      {
        question: "How do I open the full gallery?",
        answer:
`To see every artwork in one place:

1. Open Explore → Artworks in the top bar
2. Use the search box to find a title or tag
3. Just keep scrolling — more pieces load automatically
4. Tap any thumbnail to open it full-size

Use the category tabs (Characters, Sketch, Landscape) to filter.`
      },
      {
        question: "How do I find a specific artist?",
        answer:
`To reach an artist's profile:

1. Open any artwork they made
2. Tap their name or avatar at the top of the viewer
3. That opens their profile with all their artwork

Tip: in Community → Friends you can also search people by username.`
      },
      {
        question: "How do I change the theme?",
        answer:
`To switch between Default, Dark and Light:

1. Go to the Profile tab
2. Open Settings
3. Choose your theme

Your choice is saved on this device and stays next time you visit.`
      }
    ],

    account: [
      {
        question: "How do I sign up?",
        answer:
`Creating an account takes a minute:

1. Tap Profile in the top bar
2. Choose "Sign Up"
3. Enter a username, your email and a password
4. Submit — you're in!

Prefer one tap? Use Continue with Google, Discord or Apple instead.`
      },
      {
        question: "How do I log in?",
        answer:
`To log back in:

1. Tap 👤 Profile
2. Choose "Log In"
3. Enter your email and password, then submit

Or tap Google, Discord or Apple to sign in with that account.`
      },
      {
        question: "Log in with Google, Discord or Apple",
        answer:
`Social sign-in is the fastest way in:

1. Open Profile → Log In (or Sign Up)
2. Tap the Google, Discord or Apple button
3. Approve the sign-in in the pop-up
4. You'll return to DigiArtz already logged in

If a button says it isn't enabled yet, try email sign-in for now.`
      },
      {
        question: "I forgot my password",
        answer:
`If email sign-in won't work:

1. Double-check the email is spelled correctly
2. Make sure Caps Lock is off
3. If you still can't get in, contact us at DigiArtzsupport@gmail.com from your registered email so we can help you reset it

Tip: if you originally joined with Google/Discord/Apple, use that same button instead of a password.`
      },
      {
        question: "How do I log out?",
        answer:
`To sign out of this device:

1. Go to the Profile tab
2. Open Settings
3. Tap "Log Out"

You'll stay logged out until you sign in again.`
      },
      {
        question: "Login isn't working",
        answer:
`Let's get you in:

1. Confirm your email and password are correct
2. Check your internet connection
3. Close and reopen the app/tab, then try again
4. If you used a social button before, use the same one now
5. Still stuck? Email DigiArtzsupport@gmail.com with the username you're trying to reach

I won't ask for your password — never share it with anyone.`
      }
    ],

    profile: [
      {
        question: "How do I follow an artist?",
        answer:
`To follow someone whose work you like:

1. Open their profile, or open one of their artworks
2. Tap Follow

Their profile shows how many followers they have and how many artists they
follow. Following is one-way and needs no approval — tap Following again to
stop. The artist gets a notification when you follow them.`
      },
      {
        question: "Where do I see work from artists I follow?",
        answer:
`Every new piece from an artist you follow lands in your Following feed:

1. Go to Explore → Artworks
2. Pick the "Following" board — it is the first one on the row

The board is empty until you follow someone, and it shows the newest work
first. Your own follower and following counts, and the full lists of both,
are on the Analytics page under Account & Audience.`
      },
      {
        question: "How do I edit my profile?",
        answer:
`To update your profile details:

1. Open the Profile tab
2. Tap "Edit Profile"
3. Change your bio, username or social links
4. Save your changes

Your updated info shows up right away.`
      },
      {
        question: "How do I change my avatar?",
        answer:
`To set a new profile picture:

1. Go to Profile → Edit Profile
2. Tap your avatar
3. Pick an image and drag to position it in the circle
4. Confirm to upload

Note: there's a short cooldown between avatar changes.`
      },
      {
        question: "How do I change my banner?",
        answer:
`To update your profile banner:

1. Go to Profile → Edit Profile
2. Tap the banner area
3. Choose an image and drag to frame it
4. Confirm to upload

Your old banner is replaced automatically.`
      },
      {
        question: "How do I add social links?",
        answer:
`To link your other accounts:

1. Open Profile → Edit Profile
2. Find the "Connect" fields (Instagram, YouTube, X, TikTok and more)
3. Paste your profile link into each one
4. Save

Only the links you fill in will appear on your profile.`
      },
      {
        question: "How do I change my username?",
        answer:
`To rename your account:

1. Go to Profile → Edit Profile
2. Edit the Username field
3. Save

If a name is taken, try a small variation. Your username is how others find and mention you.`
      }
    ],

    upload: [
      {
        question: "How do I upload artwork?",
        answer:
`To post a new piece:

1. Open Upload → Upload Artwork in the top bar (works from anywhere)
2. Pick your image and drag to set the square thumbnail
3. Add a title, description and up to 10 tags
4. Choose the category and the software you used
5. Tap Upload Artwork

The popup closes right away — your piece appears at the top of your gallery as a blurred card while it's checked and published in the background. You can queue another upload immediately, no waiting.`
      },
      {
        question: "What do Checking, Uploading and Live mean?",
        answer:
`Every new piece moves through a quick pipeline, shown on its blurred card:

1. CHECKING — automatic verification (spam rate, duplicates, AI markers)
2. UPLOADING — your image is transferred securely
3. ALMOST DONE — the piece is being published
4. LIVE ✓ — a green check flashes and the real card takes over

Tap the blurred card anytime to open the full step-by-step status. It usually takes just a few seconds.`
      },
      {
        question: "Why did my check fail?",
        answer:
`If a piece fails checking, a popup tells you the exact reason:

1. Duplicate — the same or a very similar image is already on DigiArtz
2. AI markers — the file's metadata shows it came from an AI generator
3. Rate limit — too many uploads in a short time; wait a bit and retry
4. Merit below 80 — uploads pause until your merit recovers (+2/day)

Nothing is published on a failed check, and any transferred file is removed from storage automatically. Fix the issue and upload again whenever you're ready.`
      },
      {
        question: "Can I add more than one image?",
        answer:
`Yes — one piece can hold several images:

1. In the upload form, use "Add more images (optional)"
2. The first image stays the cover and thumbnail
3. Add as many extras as you like
4. Viewers swipe through them in the full-size viewer

Great for variants, close-ups, or step-by-step process shots.`
      },
      {
        question: "How do tags and software work?",
        answer:
`When uploading:

1. Add up to 10 tags that describe the piece (style, subject, colors)
2. Pick the software you used from the dropdown
3. Good tags help people discover your work in search

Keep tags relevant — spammy tags can get flagged.`
      },
      {
        question: "How do I edit or delete my art?",
        answer:
`To manage a piece you posted:

1. Open your Profile and go to Settings
2. Tap "Edit My Work"
3. Find the piece — use ✎ Edit to update it or ✕ Delete to remove it

Edits save instantly; deleting also removes the image file from storage.`
      },
      {
        question: "My upload failed",
        answer:
`If an upload won't go through:

1. If a "Check failed" popup appeared, it shows the exact reason — see "Why did my check fail?"
2. Otherwise check your internet connection
3. Make sure the file is an image and not too large
4. Confirm you're logged in, reload, and try once more
5. Still failing? Contact DigiArtzsupport@gmail.com with the file details

A failed upload never leaves a half-published piece — storage is cleaned up automatically.`
      }
    ],

    moderation: [
      {
        question: "Why was my upload rejected?",
        answer:
`Every image is auto-checked the moment you upload — that's your artwork, the cover on a Blog post, and the preview on a Resource or Marketplace listing.

1. If something's off, the card tells you the exact reason (like "AI-generated preview" or "screenshot detected")
2. Nothing gets published on a failed check — no half-posted piece is ever left behind
3. Any file already transferred is wiped from storage automatically
4. Fix what it flagged and upload again — there's no penalty for a rejected attempt

Pick the message you saw from this topic and I'll explain it.`
      },
      {
        question: "It says my image looks AI-generated",
        answer:
`This one depends on where you're posting:

• DigiArtz does not accept AI art anywhere. Artworks have to be made by you, and generator markers left in a file's metadata (Stable Diffusion, ComfyUI, Midjourney, NovelAI, Firefly and the like) will stop an upload on their own.
• In Resources and the Marketplace, the preview also has to be a real preview of the actual asset. A 3D render from Blender, Maya, Cinema4D or ZBrush counts as real — an AI-generated image does not.
• Hand-drawn, painted, vector, pixel and 3D work is never AI art, however polished it looks. If your own piece was flagged by mistake, re-export it (some editors leave stray markers behind) and try again.

So if an upload was turned away as AI-generated, replace it with work you made yourself — or, for a resource, a genuine photo or render of the asset — and upload again.`
      },
      {
        question: "It says photo, selfie, screenshot or document",
        answer:
`Artworks accepts original art only — not camera photos or captures. These get turned away:

• Photos — selfies, people, pets, food, products, vehicles, buildings, landscapes, cities, streets
• Screenshots — chat, game, app, social, or screen recordings
• Documents — IDs, passports, licences, bank / medical / school / legal papers, receipts, bills, invoices, payslips
• QR codes or barcodes as the main subject

A painting or render OF a landscape is fine — a photograph of one isn't. Upload the artwork itself and you're set.`
      },
      {
        question: "It says adult, gore or prohibited content",
        answer:
`Here's how the rating works:

• SAFE and MATURE are both allowed — that includes artistic nudity and suggestive or swimsuit art
• ADULT (explicit sexual content) is rejected
• A short always-blocked list — child sexual content, bestiality, extreme gore, extremist or illegal content — is refused no matter what

If a SAFE or MATURE piece got flagged by mistake, that's a rare miss — try again, and if it still won't pass, reach out at DigiArtzsupport@gmail.com.`
      },
      {
        question: "Is fan art allowed?",
        answer:
`Yes. Hand-drawn, painted or digitally made art of existing anime, game, movie or cartoon characters is accepted.

The only thing rejected is a direct repost of official media — unedited anime or game screencaps, official posters or movie stills, or scanned published manga pages. Make it your own and it's welcome here.`
      },
      {
        question: "The check keeps failing or errored",
        answer:
`If you're getting an error instead of a specific reason:

1. It's built to fail safe — when the checker can't get a clear answer it stops the upload rather than guess, so just try again
2. Give it a moment if you've posted several pieces quickly (there's a short rate limit)
3. If your merit has dropped below 80, uploads pause until it recovers (+2 a day)
4. Still stuck after a retry? Email DigiArtzsupport@gmail.com with the file details`
      }
    ],

    gallery: [
      {
        question: "How do I download an artwork?",
        answer:
`To save a piece:

1. Sign in — downloads need an account
2. Tap the artwork to open the full-size viewer
3. Tap the Download button
4. The image saves to your device

The Download button is the only way to save artwork, and every download
counts against your daily limit. The viewer shows how many you have left.`
      },
      {
        question: "How many downloads do I get?",
        answer:
`Downloads are capped per day, and the cap depends on your plan:

• Free — 5 per day
• Lite — 10 per day
• Premium — 15 per day
• Max — 20 per day

Your allowance resets every day at midnight UTC, and downloading your own
artwork never counts against it. Premium and Max get the original file;
Free and Lite get a high-quality 1600px copy.

Run out and you can wait for the reset or upgrade from the Subscription page.`
      },
      {
        question: "How do I share an artwork?",
        answer:
`To share a piece with someone:

1. Open the artwork in the viewer
2. Tap the Share button
3. Copy the link or pick an app to share to

Please always keep the artist's credit intact when sharing.`
      },
      {
        question: "How do I like or bookmark art?",
        answer:
`To show love or save for later:

1. Open the artwork
2. Tap the like (heart) to support the artist
3. Tap bookmark to save it to your collection

You'll need to be logged in for these to stick.`
      },
      {
        question: "How do I comment on art?",
        answer:
`To leave a comment:

1. Open the artwork
2. Scroll to the comment area
3. Type your message (you can attach an image too)
4. Send

Keep it kind and constructive — that's what the community is about.`
      },
      {
        question: "How do I report an artwork?",
        answer:
`If a piece breaks the rules:

1. Open the artwork in the viewer
2. Tap the Report button
3. Tell us what's wrong and submit

Our team reviews reports and takes action when needed. For urgent issues, also email DigiArtzsupport@gmail.com.`
      }
    ],

    resources: [
      {
        question: "What are Resources?",
        answer:
`Resources are downloadable assets other creators can grab and use — brushes, brush packs, textures, patterns, seamless tiles, fonts, templates, UI kits, 3D models, icons, presets and more.

Open Explore → Resources in the top bar to browse them, and tap any card to see it in full.`
      },
      {
        question: "How do I share a resource?",
        answer:
`1. Open Upload → Share a Resource in the top bar
2. Attach the resource file — ZIP, RAR, 7z, PSD, ABR, brushset, Procreate, CLIP, fonts, PDF or 3D (OBJ/FBX/BLEND), up to 200MB
3. Add the required preview image so people can see what it is (this gets auto-checked)
4. Fill in a title, description, category, licence and what you made it with
5. Add tags and post

The preview must show the actual asset — if it's turned away, see "Upload Checks & Rejections".`
      },
      {
        question: "How do I download a resource?",
        answer:
`1. Tap a resource to open it
2. Hit ⬇ Download file
3. It opens in a new tab and saves to your device

Free resources download straight away.`
      },
      {
        question: "What file types can I upload?",
        answer:
`For the resource file: ZIP, RAR, 7z, PSD, ABR, brushset, Procreate, CLIP, TTF/OTF/WOFF2 fonts, PDF, and 3D formats (OBJ, FBX, BLEND) — up to 200MB.

The preview image is separate: JPG, PNG, WEBP or GIF, up to 25MB.`
      }
    ],

    blog: [
      {
        question: "What is the Blog?",
        answer:
`The Blog is where the community writes — stories, tips, studio notes, guides and updates.

Open Explore → Blog in the top bar to read posts, and tap any one to read it in full and leave a comment.`
      },
      {
        question: "How do I write a post?",
        answer:
`1. Open Upload → Write a Blog Post in the top bar
2. Add a title, and an optional cover image
3. Write your post (at least 40 characters) and, if you like, a one-line excerpt for the list
4. Pick a category, add tags, and publish

Posts go live right away. A cover image, if you add one, is checked the same way artwork is.`
      },
      {
        question: "Do I need an image for a post?",
        answer:
`No — the cover image is optional, so a post can be pure writing. If you do add one, it follows the normal artwork image rules.`
      },
      {
        question: "How do I comment on a post?",
        answer:
`Open the post, scroll to the comments, then type and send. You'll need to be logged in. Keep it kind and constructive — same as everywhere on DigiArtz.`
      }
    ],

    marketplace: [
      {
        question: "What is the Marketplace?",
        answer:
`The Marketplace is where creators sell. There are three kinds of listing:

• Digital download — a file the buyer gets instantly after paying
• Commission slot — you take on a custom piece
• Service — any creative service you offer

Open Explore → Marketplace in the top bar to browse everything on offer.`
      },
      {
        question: "How do I buy something?",
        answer:
`1. Open the listing
2. Free items — tap Download and it's yours right away
3. Paid items — tap Buy and complete the secure checkout; the download starts the moment payment clears
4. Commissions and services have no file — paying places the order, and the seller takes it from there

Already bought it? Opening it again just re-downloads — you're never charged twice.`
      },
      {
        question: "How do I sell or list a product?",
        answer:
`1. Open Upload → List a Product in the top bar
2. Pick the listing type — digital download, commission or service
3. For a digital download, attach the file (up to 200MB); every listing needs a preview image
4. Set a title, description, category, price and currency (USD, EUR, GBP, INR or JPY) — leave the price at 0 to list it free
5. Choose a licence, add tags, and post

The preview is auto-checked, so make sure it shows the real product.`
      },
      {
        question: "How do payments work?",
        answer:
`Checkout runs through our payment partner. Your payment is verified before anything unlocks, and digital files release automatically once it clears.

If a charge went through but the item didn't unlock, email DigiArtzsupport@gmail.com with the details and we'll sort it out.`
      }
    ],

    jobs: [
      {
        question: "What is the Jobs board?",
        answer:
`Explore → Jobs is where studios and creators post paid work — freelance, full-time, part-time, remote, internships, contests and collabs — and where artists find it.

Tap any listing to see the full role, requirements and pay.`
      },
      {
        question: "How do I apply to a job?",
        answer:
`1. Open the listing to read the role, requirements and pay
2. Use the apply link or apply email shown on it
3. Follow that studio's own steps from there

Every genuine posting has a way to apply — a link or an email — so you always know where to send your work.`
      },
      {
        question: "How do I post a job?",
        answer:
`1. Open Upload → Post a Job in the top bar
2. Posting needs a Premium or Max subscription — without one the page offers you both plans instead of the form
3. Add the title, company, and a description (at least 80 characters)
4. Set the category, employment type, and location — or tick remote and list the eligible countries
5. Add the pay range (optional) and a closing date
6. Give a way to apply — an apply link or an email is required — then post

No image needed. Postings past their closing date hide themselves automatically.`
      },
      {
        question: "Who can post a job?",
        answer:
`Premium and Max members.

• Premium — 1 posting per plan month
• Max — 2 postings per plan month
• Free and Lite — read and apply to every posting, but cannot put one up

Your allowance refills once every plan month, and the form shows how many you have left before you start writing. A posting waiting on a scheduled publish date has already used its slot.`
      },
      {
        question: "Is there a fee to post a job?",
        answer:
`There is no separate checkout for a posting — it is part of a subscription. Premium includes 1 posting a plan month and Max includes 2, and no image or extra payment is needed beyond that.

Spam, MLM and pay-to-apply postings aren't allowed and get removed.`
      }
    ],

    cart: [
      {
        question: "Where is my Cart?",
        answer:
`Your cart is the 🛒 icon in the top bar, beside the notification bell. It's your place for orders, downloads and licences from the Marketplace.`
      },
      {
        question: "How does the Cart work?",
        answer:
`DigiArtz keeps buying quick — there's no multi-item basket to fill. You buy a listing and it's yours immediately: free items download on tap, paid ones the moment checkout clears.

Your cart — the 🛒 in the top bar — is where those purchases, downloads and licences gather.`
      },
      {
        question: "Where are my purchases and downloads?",
        answer:
`Open a Marketplace item you've bought and it re-downloads at no charge — your ownership is remembered.

The cart brings orders, downloads and licences into one spot. Some of it is still rolling out, so if something isn't showing yet, your purchase is safe and you can always re-download from the listing.`
      },
      {
        question: "Can I save something for later?",
        answer:
`To keep a piece handy, tap Bookmark on any artwork or listing — it lands in your saved collection. A dedicated "Saved for Later" list is on the way to the cart.`
      }
    ],

    community: [
      {
        question: "How do communities work?",
        answer:
`Communities are topic rooms on the Communities page:

1. Tap Communities in the top bar
2. Pick a room (Art Talk, Feedback, Collab, Tips, Showcase…)
3. Read along, or post if you're logged in

Some rooms (like the Official one) are read-only announcements.`
      },
      {
        question: "How do I post in a community?",
        answer:
`To join the conversation:

1. Open a community room
2. Type in the message bar at the bottom
3. Send

In the Showcase room you attach one of your own artworks instead of plain text. Scroll up to load older messages.`
      },
      {
        question: "How do I message a friend (DMs)?",
        answer:
`To chat one-on-one:

1. Open Communities in the top bar
2. Go to Friends
3. Tap a person to open your chat
4. Type and send (text only — links aren't allowed)

Scroll to the top of a chat to load older messages.`
      },
      {
        question: "How do I add friends?",
        answer:
`To connect with someone:

1. Tap Friends in the top bar
2. Use the search box to find them by username
3. Open their chat and say hi

Starting a conversation adds them to your list automatically.`
      },
      {
        question: "What is Zeo?",
        answer:
`That's me! 🤖 I'm Zeo, the DigiArtz help assistant.

• I guide you through common tasks step by step
• Find me any time at the top of your Friends list
• I can't see your password or private data — I only help you navigate

Pick a topic and I'll take it from there.`
      }
    ],

    billing: [
      {
        question: "What subscription tiers are there?",
        answer:
`Three paid tiers sit above the free account, and each one raises your daily
download limit:

• Free — 5 downloads a day
• Lite — 10 a day at high-quality 1600px
• Premium — 15 a day at full resolution, custom artwork requests, early access
• Max — 20 a day, 5 custom artworks, custom website build, priority support

Higher tiers also carry a badge on your profile. Sign in and open the
Subscription page to see what each one costs and compare them side by side.

Browsing and posting stay free — subscriptions are optional.`
      },
      {
        question: "How do I subscribe?",
        answer:
`To start a subscription:

1. Open the Subscriptions section
2. Choose the tier you want
3. Follow the checkout steps to complete payment

Once done, your perks and badge activate on your account.`
      },
      {
        question: "How do I cancel my subscription?",
        answer:
`To stop a subscription renewing:

1. Open your Profile / account area
2. Find your subscription details
3. Choose to cancel or turn off renewal

If you can't find the option, email DigiArtzsupport@gmail.com before your next billing date and we'll assist.`
      }
    ],

    policies: [
      {
        question: "Privacy Policy (summary)",
        answer:
`In short — our Privacy Policy covers:

1. What we collect (account info, content you post, usage & cookies)
2. How we use it (run the site, moderate, improve, show ads)
3. Who we share with (service providers, Google/ads, legal requests)
4. Your rights (access, correct, delete, opt out)

Read the full version any time from the footer → Privacy Policy.`
      },
      {
        question: "Terms & Conditions (summary)",
        answer:
`The Terms you agree to by using DigiArtz cover:

1. Who can use the platform and account responsibilities
2. That you keep ownership of your content (you grant us a licence to host/show it)
3. Community rules — no illegal, hateful, or infringing content
4. Moderation, advertising and limitation of liability

Full text: footer → Terms & Conditions.`
      },
      {
        question: "How is my data used?",
        answer:
`Quick answer:

• We use your data to run your account, show your content, keep the site safe, and improve it
• We may show ads (including Google) which can use cookies
• We don't sell your personal info in the ordinary sense
• You can request access to or deletion of your data

For details and requests, see the Privacy Policy or email DigiArtzsupport@gmail.com.`
      }
    ],

    safety: [
      {
        question: "How do I report an artwork?",
        answer:
`To flag a piece that breaks the rules:

1. Open the artwork in the viewer
2. Tap Report
3. Describe the problem and submit

We review every report. For anything urgent, also email DigiArtzsupport@gmail.com.`
      },
      {
        question: "How do I report a user?",
        answer:
`If someone is behaving badly:

1. Note their username and what happened (screenshots help)
2. Email DigiArtzsupport@gmail.com with the details
3. Our team will review and act per the community rules

We take harassment and abuse seriously.`
      },
      {
        question: "I'm being harassed",
        answer:
`I'm sorry that's happening. Here's what to do:

1. Don't engage further with the person
2. Save evidence (screenshots, usernames, dates)
3. Report it to DigiArtzsupport@gmail.com right away

If you're ever in immediate danger offline, contact your local emergency services.`
      },
      {
        question: "Someone stole my art (copyright)",
        answer:
`To report content that infringes your rights:

1. Find the specific artwork on DigiArtz
2. Gather proof that the original is yours
3. Send a notice to DigiArtzsupport@gmail.com with links and proof

We may remove infringing content and act on repeat offenders.`
      },
      {
        question: "Someone accessed my account",
        answer:
`Act quickly to secure it:

1. If you can still log in, change your password immediately
2. Log out of other devices where possible
3. Email DigiArtzsupport@gmail.com from your registered email so we can help lock it down

Never share your password — DigiArtz staff and I will never ask for it.`
      }
    ],

    trouble: [
      {
        question: "The site won't load",
        answer:
`Try these in order:

1. Check your internet connection
2. Refresh the page
3. Clear the cache or try a private/incognito window
4. Try another browser or device
5. If it's still down, wait a bit and retry

If it persists, let us know at DigiArtzsupport@gmail.com.`
      },
      {
        question: "Images won't load",
        answer:
`If artwork thumbnails are blank:

1. Refresh the page
2. Check your connection (images need more bandwidth)
3. Disable any ad/content blockers for this site
4. Try a different browser

Still blank? Tell us at DigiArtzsupport@gmail.com what device and browser you're on.`
      },
      {
        question: "I see a flash or flicker on load",
        answer:
`A brief flash while the page starts up is usually harmless.

1. Fully refresh the page
2. Make sure you're on the latest version (clear cache)
3. If it keeps happening, note your device + browser and email DigiArtzsupport@gmail.com

This helps us track down display quirks.`
      },
      {
        question: "My changes aren't saving",
        answer:
`If edits or uploads won't stick:

1. Confirm you're logged in
2. Check your connection
3. For uploads, keep the tab open until the blurred card shows LIVE ✓
4. Reload and check if the change actually applied
5. Try once more, then contact DigiArtzsupport@gmail.com if it repeats`
      },
      {
        question: "Something looks broken",
        answer:
`Thanks for spotting it! To report a visual bug:

1. Take a screenshot of the problem
2. Note your device, browser and what you were doing
3. Send it to DigiArtzsupport@gmail.com

Details like these help us fix it fast.`
      }
    ],

    contact: [
      {
        question: "Email support",
        answer:
`You can reach the DigiArtz team by email:

1. Write to DigiArtzsupport@gmail.com
2. Include your username and a clear description
3. Attach screenshots if it helps

We'll get back to you as soon as we can.`
      },
      {
        question: "Report a bug",
        answer:
`Found a bug? Help us squash it:

1. Note what happened and how to trigger it
2. Add your device + browser
3. Attach a screenshot if you can
4. Send it to DigiArtzsupport@gmail.com`
      },
      {
        question: "Business or collab inquiry",
        answer:
`For collaborations, commissions or business:

1. Email DigiArtzsupport@gmail.com
2. Tell us who you are and what you have in mind
3. Include any relevant links or references

The DigiArtz team reviews every message.`
      }
    ]
  },

  speechBubbles: []
};
