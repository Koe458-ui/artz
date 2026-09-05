import { SB_URL_FALLBACK, SB_ANON_FALLBACK } from '../lib/sb.js';
import { json } from '../lib/http.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 6;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// A rejection has to be confident. Below this is the model hedging, and a hedge must never cost an artist their upload.
export const REJECT_CONFIDENCE = 0.75;

// these stop an upload however the rest of the verdict reads
export const HARD_REJECT = [
  'ADULT_CONTENT', 'PROHIBITED_CONTENT', 'NSFW_CONTENT', 'GORE_CONTENT'
];

// Codes the model reaches for when unsure, not when it has seen a photo, screenshot or document. Accept on all
export const SOFT_CODES = [
  'UNCLEAR', 'LOW_QUALITY', 'TEXT_ONLY', 'NOT_ARTWORK', 'NOT_RESOURCE'
];

// Moderator unreachable. Artwork is kept and queued, so this is not a rejection and must never read like one
export const DEFERRED_MESSAGE =
  'Moderation is temporarily unavailable. Your upload is saved and will be ' +
  'checked automatically as soon as it is back — you do not need to upload it again.';

export const CATEGORIES = [
  'ARTWORK_OK','SELFIE','MIRROR_SELFIE','FAMILY_PHOTO','GROUP_PHOTO','COUPLE_PHOTO',
  'BABY_PHOTO','PET_PHOTO','CASUAL_PHOTO','TRAVEL_PHOTO','FOOD_PHOTO','DRINK_PHOTO',
  'PRODUCT_PHOTO','VEHICLE_PHOTO','HOUSE_PHOTO','INTERIOR_PHOTO','LANDSCAPE_PHOTO',
  'CITY_PHOTO','STREET_PHOTO','BUILDING_PHOTO','OBJECT_PHOTO','CHAT_SCREENSHOT',
  'GAME_SCREENSHOT','APP_SCREENSHOT','SOCIAL_SCREENSHOT','SCREEN_RECORDING','ID_CARD',
  'PASSPORT','DRIVING_LICENCE','BANK_DOCUMENT','MEDICAL_DOCUMENT','SCHOOL_DOCUMENT',
  'OFFICE_DOCUMENT','LEGAL_DOCUMENT','RECEIPT','BILL','INVOICE','SALARY_SLIP',
  'TAX_DOCUMENT','LOAN_DOCUMENT','INSURANCE_PAPER','QR_CODE','BARCODE','ADVERTISEMENT',
  'FLYER','SPAM_IMAGE','BLANK_IMAGE','LOW_QUALITY','TEXT_ONLY','NOT_ARTWORK',
  'ADULT_CONTENT','PROHIBITED_CONTENT','AI_GENERATED','UNCLEAR'
];

export const MESSAGES = {
  SELFIE:            'A selfie or personal photograph was detected. DigiArtz accepts original artwork only.',
  MIRROR_SELFIE:     'A mirror selfie was detected. Please upload an original artwork instead.',
  FAMILY_PHOTO:      'A family photograph was detected. DigiArtz accepts artwork only.',
  GROUP_PHOTO:       'A group photograph was detected. Please upload original artwork.',
  COUPLE_PHOTO:      'A couple photograph was detected. DigiArtz accepts artwork only.',
  BABY_PHOTO:        'A baby photograph was detected. Please upload an artwork instead.',
  PET_PHOTO:         'A pet photograph was detected. DigiArtz accepts original artwork only.',
  CASUAL_PHOTO:      'A real-world camera photo was detected. Please upload artwork only.',
  TRAVEL_PHOTO:      'A travel photograph was detected. DigiArtz accepts artwork only.',
  FOOD_PHOTO:        'A food photograph was detected. Please upload an artwork instead.',
  DRINK_PHOTO:       'A drink or beverage photograph was detected. DigiArtz accepts artwork only.',
  PRODUCT_PHOTO:     'A product photograph was detected. Please upload original artwork.',
  VEHICLE_PHOTO:     'A vehicle photograph was detected. DigiArtz accepts artwork only.',
  HOUSE_PHOTO:       'A house photograph was detected. Please upload artwork instead.',
  INTERIOR_PHOTO:    'An interior photograph was detected. DigiArtz accepts original artwork only.',
  LANDSCAPE_PHOTO:   'A landscape photograph was detected. Please upload an artwork instead.',
  CITY_PHOTO:        'A city photograph was detected. DigiArtz accepts artwork only.',
  STREET_PHOTO:      'A street photograph was detected. Please upload original artwork.',
  BUILDING_PHOTO:    'A building photograph was detected. DigiArtz accepts artwork only.',
  OBJECT_PHOTO:      'An object photograph was detected. Please upload artwork instead.',
  CHAT_SCREENSHOT:   'A chat screenshot was detected. DigiArtz accepts original artwork only.',
  GAME_SCREENSHOT:   'A game screenshot was detected. Please upload an artwork instead.',
  APP_SCREENSHOT:    'An app screenshot was detected. DigiArtz accepts artwork only.',
  SOCIAL_SCREENSHOT: 'A social media screenshot was detected. Please upload original artwork.',
  SCREEN_RECORDING:  'Screen-recording content was detected. DigiArtz accepts artwork only.',
  ID_CARD:           'An ID card or identity document was detected. DigiArtz accepts artwork only.',
  PASSPORT:          'A passport or travel document was detected. Please upload artwork instead.',
  DRIVING_LICENCE:   'A driving licence was detected. DigiArtz accepts original artwork only.',
  BANK_DOCUMENT:     'A bank document was detected. Please upload artwork instead.',
  MEDICAL_DOCUMENT:  'A medical document was detected. DigiArtz accepts artwork only.',
  SCHOOL_DOCUMENT:   'A school document was detected. Please upload original artwork.',
  OFFICE_DOCUMENT:   'An office document was detected. DigiArtz accepts artwork only.',
  LEGAL_DOCUMENT:    'A legal document was detected. Please upload an artwork instead.',
  RECEIPT:           'A receipt was detected. DigiArtz accepts original artwork only.',
  BILL:              'A bill or payment statement was detected. Please upload artwork instead.',
  INVOICE:           'An invoice was detected. DigiArtz accepts artwork only.',
  SALARY_SLIP:       'A salary slip or payslip was detected. Please upload original artwork.',
  TAX_DOCUMENT:      'A tax document was detected. DigiArtz accepts artwork only.',
  LOAN_DOCUMENT:     'A loan document was detected. Please upload an artwork instead.',
  INSURANCE_PAPER:   'An insurance document was detected. DigiArtz accepts original artwork only.',
  QR_CODE:           'A QR code was detected. Please upload artwork instead.',
  BARCODE:           'A barcode was detected. DigiArtz accepts original artwork only.',
  ADVERTISEMENT:     'An advertisement or promotional image was detected. Please upload artwork instead.',
  FLYER:             'A flyer or poster was detected. DigiArtz accepts artwork only.',
  SPAM_IMAGE:        'The image was flagged as spam or irrelevant content. Please upload original artwork.',
  BLANK_IMAGE:       'The uploaded image appears to be blank.',
  LOW_QUALITY:       'The image is too low quality or could not be processed.',
  TEXT_ONLY:         'Images containing primarily text are not accepted as artwork.',
  AI_GENERATED:      'The image looks AI-generated. DigiArtz does not accept AI art — please upload artwork you made yourself.',
  NOT_ARTWORK:       'The uploaded image does not appear to be artwork. DigiArtz accepts original artistic creations only.',
  ADULT_CONTENT:     'The image contains adult content, which is not permitted on DigiArtz.',
  PROHIBITED_CONTENT:'The image contains prohibited content and cannot be uploaded.',
  UNCLEAR:           'We could not confirm this image as original artwork. Please upload a clearer artwork image.'
};

export const RESOURCE_CATEGORIES = [
  'RESOURCE_OK','AI_GENERATED','PERSON_PHOTO','NSFW_CONTENT','GORE_CONTENT',
  'TEXT_ONLY','SCREENSHOT','DOCUMENT','SPAM_IMAGE','BLANK_IMAGE','LOW_QUALITY',
  'NOT_RESOURCE','PROHIBITED_CONTENT','UNCLEAR'
];

export const RESOURCE_MESSAGES = {
  AI_GENERATED:      'The preview looks AI-generated. DigiArtz resources need a real preview of the asset (a 3D render or hand-made artwork is fine — AI-generated art is not).',
  PERSON_PHOTO:      'A real photograph of a person was detected. Please use a preview that shows the file you are offering.',
  NSFW_CONTENT:      'The preview contains adult or NSFW content, which is not permitted on DigiArtz.',
  GORE_CONTENT:      'The preview contains graphic or violent content and cannot be uploaded.',
  TEXT_ONLY:         'The preview is mostly plain text. Please show what the file actually looks like (code snippets and lettering art are fine).',
  SCREENSHOT:        'A chat, forum, social, or game screenshot was detected. Please use a preview of the file itself.',
  DOCUMENT:          'A document or form was detected. Please use a preview image of what you are offering.',
  SPAM_IMAGE:        'The preview was flagged as spam or promotional content. Please upload a genuine preview.',
  BLANK_IMAGE:       'The preview image appears to be blank.',
  LOW_QUALITY:       'The preview is too low quality or could not be processed.',
  NOT_RESOURCE:      'This does not look like a usable preview. Show the artwork, brush, texture, template, font, model, or asset you are offering.',
  PROHIBITED_CONTENT:'The preview contains prohibited content and cannot be uploaded.',
  UNCLEAR:           'We could not confirm this as a valid preview. Please upload a clearer preview image.'
};

export const RESOURCE_PROMPT = `You are the preview moderator for DigiArtz, a digital creator community.

The user is offering a downloadable FILE — either a creative resource (a brush, texture, font, template, code pack, 3D model, etc.) or a piece of ARTWORK sold or shared as a file (an illustration, print, digital painting, clipart or sticker pack, etc.). You are shown its PREVIEW IMAGE only — judge whether that preview is acceptable.

Your job is to keep out photographs of people, screenshots, documents, spam, and explicit content. It is NOT to judge whether the file is good, original, or new. Creators lose real listings every time you reject wrongly, so ACCEPT is the default and a rejection has to be earned.

Step 1: Preview Check

ACCEPT the preview when it shows a usable digital file a creator would download and use, for example:
- ARTWORK offered as a file: illustrations, digital paintings, drawings, sketches, line art, character art, anime/manga art, comic or manhwa pages, chibi art, fan art, concept art, poster and cover art, wallpapers, traditional art (pencil, ink, watercolour, oil, acrylic) photographed or scanned as a file, pixel art, vector art, clipart and sticker packs, print-ready art and art prints, coloring pages, tattoo flash, emotes and avatars, album or book covers, sculptures and handcrafted work
- brushes, brush packs, stamp/brush stroke sheets, textures, patterns, seamless tiles, materials
- fonts, typefaces, lettering or type specimens
- website templates, landing-page or UI mockups, app UI kits, dashboard designs, design systems
- code, code snippets, or syntax-highlighted code screenshots offered as a developer resource
- 3D models and renders from 3D software (Blender, Maya, Cinema4D, ZBrush, etc.), sculpts, wireframes, turntables
- icon sets, vector asset sheets, logo/template kits, mockup scenes, device/product mockups
- backgrounds, presets, LUTs, grading previews, plugin or tool UI previews
- commission and service listings previewed with samples of the creator's own work

CRITICAL clarifications — do NOT reject these:
- GAME ART AND GAME ASSETS ARE VALID FILES. Game characters, game fan art, sprite and pixel-art sheets, tilesets, game UI and HUD kits, item/weapon/skin designs, splash and key art, level and map art, and game-ready 3D models are all acceptable previews. SCREENSHOT is ONLY for an unmodified capture of a running game or app — visible live HUD, health bars, minimap, menus, chat overlays, or platform UI. Without those, it is game art: accept it.
- REPOSTS AND DUPLICATES ARE NOT YOUR CONCERN. Whether the preview already exists on DigiArtz, resembles another listing, or is one of several near-identical pieces from the same pack or series is irrelevant. Never reject a preview as a duplicate, a repost, a copy, unoriginal, or "already seen".
- ARTWORK IS A VALID FILE TO SELL OR SHARE HERE. A preview that is simply a finished artwork is acceptable on its own — it does not have to show a brush, template, or asset sheet. Never answer NOT_RESOURCE just because the preview is "art rather than a resource".
- MANGA, MANHWA, WEBTOON, AND COMIC FILES ARE VALID: pages, panels, spreads, covers, screentoned or inked pages, and page templates. Speech bubbles and dialogue do not make a page TEXT_ONLY or a DOCUMENT.
- 3D MODELS AND RENDERS ARE VALID in every form: renders, clay and matcap previews, wireframes, retopology and UV shots, turntables, sculpts, texture and material previews, and rig or pose sheets. A capture of a Blender, Maya, ZBrush, Cinema4D, Substance, or Unreal/Unity viewport showing the model being offered is a legitimate preview, not a SCREENSHOT, and a 3D render is never AI-generated art.
- A drawn, painted, or rendered PERSON or portrait is artwork, not PERSON_PHOTO. Only a real camera photograph of a real person is PERSON_PHOTO.
- Typography, lettering, and calligraphy artwork are accepted; they are not TEXT_ONLY.
- Fan art of existing anime, game, or movie characters is accepted. Reject only unmodified official media (anime screencaps, official posters, scanned published pages).
- A single artwork with no packaging, mockup, or watermark is still fine.

The bias: if it plausibly shows a downloadable creative file — artwork included — ACCEPT it (resource=true). When you are weighing "usable file" against "photo/screenshot/document" and it is not obvious, accept. UNCLEAR means you truly cannot read the image, and it is treated as an acceptance.

Step 2: Always-reject rules (set resource=false and the matching category)
- AI_GENERATED — the preview is an AI-generated / generative-diffusion image (Midjourney, Stable Diffusion, DALL·E, etc.). IMPORTANT: hand-drawn, digitally painted, and vector artwork are NOT AI-generated, and a 3D RENDER from Blender/Maya/C4D/ZBrush is NOT AI-generated — all of these must be ACCEPTED. Do not confuse polished human artwork or rendered CGI with AI art. Only flag AI_GENERATED when there is clear evidence of generative AI art — a visible generator watermark, or the unmistakable artefacts of diffusion output. "It looks too polished", "the anatomy is off", or "it feels AI-ish" is NOT evidence: accept those.
- PERSON_PHOTO — a real camera photograph of a person (selfie, portrait, casual photo of people). Drawn or painted people do not count.
- NSFW_CONTENT — sexual, adult, or explicit content.
- GORE_CONTENT — graphic gore or extreme violence.
- TEXT_ONLY — the preview is just plain paragraph text or a wall of writing with no design, art, or code purpose. (Syntax-highlighted CODE and lettering ART are NOT text-only — accept them.)
- SCREENSHOT — a chat, forum, social-media, or game screenshot that is not itself the file being offered.
- DOCUMENT — an ID, receipt, invoice, form, or official document.
- SPAM_IMAGE — an advertisement, promo, or spam image.
- BLANK_IMAGE / LOW_QUALITY — blank, corrupted, or unusably low-resolution.
- NOT_RESOURCE — clearly neither artwork nor any kind of usable creative file (for example a plain camera photo of a room, a meal, or an object), with no better code.

Always reject regardless of anything else (PROHIBITED_CONTENT): child sexual content, bestiality, extreme gore, terrorist or extremist content, malware/phishing images, illegal content.

Step 3: Rating — SAFE, MATURE, or ADULT (same meaning as art). SAFE (no nudity or sexual content) and MATURE (artistic nudity, suggestive or ecchi-style art) are both accepted; only ADULT (explicit sexual content) is rejected.

Step 4: Quality — GOOD unless blank, corrupted, extremely blurry, or unusably low resolution. Deliberate style (pixel art, low-poly, rough sketching, minimal) is NOT a quality failure.

Confidence: report how sure you are of the verdict you gave. A rejection you are not sure about will be overridden and let through, so give an honest low number rather than inflating it.

Return JSON: allow (true when the preview shows an acceptable artwork or resource file, the rating is SAFE or MATURE, quality is GOOD, and it is not AI-generated), resource (bool — true for artwork previews too), rating, ai_generated (bool), quality, category (one code from the allowed list), reason (short internal note), confidence (0 to 1).`;

export const MODERATION_PROMPT = `You are the artwork upload moderator for DigiArtz, a digital art community.

Your job is to keep out photographs, screenshots, documents, and explicit content. It is NOT to judge whether the artwork is good, original, popular, or new. Artists lose real work every time you reject something wrongly, so ACCEPT is the default and a rejection has to be earned.

Step 1: Artwork Check

Start from allow = true. Only move away from it if you can point at a concrete non-art thing in the image.

DigiArtz accepts artwork of every kind, including:
characters, anime, manga, comic and manhwa pages, fan art, chibi, sketches, doodles, line art, illustrations, concept art, digital art, traditional art (pencil, ink, watercolor, oil, acrylic, marker), abstract art, typography and lettering art, calligraphy, poster art, logo and icon design, wallpaper art, tattoo flash, emotes and avatars, cars, bikes, trucks, buses, aircraft, ships, robots, mecha, weapon designs, fantasy, dragons, monsters, mythology, sci-fi, space art, nature and animal and bird and marine art, landscape and scenery painting, cityscape and architecture art, interior art, food art, flower and tree art, patterns, 3D art and renders of every style, pixel art, aesthetic art, sculptures and handcrafted work, photographs of a physical artwork the artist made (a scanned drawing, a photographed canvas or sculpture).

CRITICAL clarifications — these are ACCEPTED, never reject them:
- GAME ART IS ALLOWED, and this is the mistake to avoid most. Game characters, game fan art, game-style illustrations, game concept art, character sheets, sprite and pixel-art sheets, UI and HUD art, item and weapon and skin designs, map and level art, splash art, key art, box art, 3D game models and renders, and art posted in a games or gaming category are all artwork. GAME_SCREENSHOT is ONLY for an unmodified capture of a game as it ran on a screen — visible live HUD, health bars, minimap, subtitle bars, menus, chat overlays, FPS counters, or platform/console UI. If those are absent, it is game ART: accept it.
- MANGA, MANHWA, MANHUA, WEBTOON, AND COMIC WORK IS ALLOWED in every form: finished pages, single panels, multi-panel spreads, page layouts with speech bubbles and sound effects, black-and-white screentoned pages, inked or pencilled roughs, storyboards and thumbnails, covers, character sheets, and strips read left-to-right or right-to-left. Speech bubbles and dialogue do NOT make a page TEXT_ONLY or a DOCUMENT, and a photographed or scanned page of the artist's own comic is artwork, not a photo. Reject only an unmodified scan of an officially published book.
- 3D MODELS AND RENDERS ARE ALLOWED in every form: finished renders, clay and matcap renders, wireframes, retopology and topology shots, UV layouts, turntable sheets, sculpts, high-poly and low-poly models, texture and material previews, rigs and pose sheets, and multi-angle model sheets. A capture of a Blender, Maya, ZBrush, Cinema4D, Substance, or Unreal/Unity viewport showing the artist's own model is ARTWORK, not APP_SCREENSHOT — the software chrome around a model the artist made does not turn it into a screenshot. A 3D render is never AI-generated art.
- FAN ART IS ALLOWED. Drawn, painted, or rendered artwork of existing anime, manga, movie, game, or cartoon characters is accepted. Only reject an unmodified repost of OFFICIAL media: an anime screencap, an official poster or key visual, a movie still, a scanned published manga page.
- AI ART IS PROHIBITED. DigiArtz accepts artwork the artist made themselves, so an AI-generated or generative-diffusion image (Midjourney, Stable Diffusion, DALL·E, NovelAI, Firefly, and the like) is rejected as AI_GENERATED. Judge this on evidence, not on polish: hand-drawn, digitally painted, vector, pixel, and 3D work must still be ACCEPTED, and "it looks too polished", "it is too clean", "the anatomy is off", or "it feels AI-ish" is NOT evidence. Flag AI_GENERATED only for clear signs of generative output — a visible generator watermark or the unmistakable artefacts of diffusion.
- REPOSTS AND DUPLICATES ARE NOT YOUR CONCERN. Whether the image already exists on DigiArtz, resembles another upload, or is one of several near-identical pieces from the same series is irrelevant. An artist may post two or three versions of the same drawing. Never reject an image as a duplicate, a repost, a copy, unoriginal, or "already seen".
- TYPOGRAPHY, LETTERING, AND CALLIGRAPHY ART IS ALLOWED. TEXT_ONLY is only for a plain unstyled wall of writing with no design intent.
- LOGO AND ICON DESIGN IS ALLOWED as original design work. Reject only a reposted logo of a real existing brand.
- POSTER ART IS ALLOWED. Reject only a real commercial advertisement or promotional flyer for an actual product, event, or service.
- Artwork of realistic people, animals, food, vehicles, buildings, or landscapes is still artwork. A PAINTING or RENDER of a landscape is accepted; only a camera PHOTOGRAPH of one is not.
- Rough, unfinished, minimal, low-contrast, small, or heavily stylised work is still artwork.

REJECT only when the image is plainly one of these and you can say so with confidence:
- a real camera photograph (selfie, mirror selfie, family/group/couple/baby photo, pet photo, casual snapshot, travel, food or drink, product, or a photo of a vehicle, house, room, landscape, city, street, building, or object) — this does not cover a photo or scan of the artist's own physical artwork
- a raw screenshot of a chat, app, social feed, screen recording, or a live game as described above
- an identity, financial, or official document (ID card, passport, licence, bank/medical/school/office/legal document, receipt, bill, invoice, salary slip, tax/loan/insurance paper)
- a QR code or barcode as the main subject
- a real-world advertisement or spam image
- a genuinely blank image
- an AI-generated image, on the evidence described above

If you are weighing "artwork" against "photo/screenshot/document" and it is not obvious, answer ARTWORK_OK with allow = true. Use UNCLEAR only when the image is truly unreadable, and know that UNCLEAR is treated as an acceptance.

Step 2: Content Rating

SAFE: no nudity, no sexual content.
MATURE: artistic nudity, suggestive poses, bikini or swimsuit art, cleavage, mild sensual content, ecchi-style artwork. MATURE is ACCEPTED — do not reject it.
ADULT: explicit sexual acts, visible genitals in a sexual context, hardcore pornography, fetish-only content.

Always reject regardless of anything else: child sexual content, bestiality, extreme gore, terrorist or extremist content, malware/phishing images, illegal content.

Step 3: Quality Check

Set quality to BAD only if the image is blank, corrupted, or completely unreadable. Rough sketching, minimalism, low-poly, pixel art, grain, small size, and low resolution are NOT quality failures.

Step 4: Category Code

- ARTWORK_OK whenever the image is artwork — this is the expected answer for the large majority of uploads
- otherwise the specific code matching the non-art thing you actually see (SELFIE, PET_PHOTO, GAME_SCREENSHOT, ID_CARD, RECEIPT, QR_CODE, and so on)
- BLANK_IMAGE only for a genuinely empty image
- AI_GENERATED for generative AI art
- ADULT_CONTENT for explicit sexual content, PROHIBITED_CONTENT for the always-reject cases
- NOT_ARTWORK only when it is definitely not art and no specific code fits
- UNCLEAR when you cannot tell

Confidence: report how sure you are of the verdict you gave. A rejection you are not sure about will be overridden and let through, so give an honest low number rather than inflating it.

Return your verdict as JSON with fields: allow, artwork, ai_generated (bool), rating, quality, category (one code from the list), reason (short internal note), confidence (0 to 1).`;

export async function onRequestPost(context) {
  const { request, env } = context;
  const SB_URL = env.SUPABASE_URL || SB_URL_FALLBACK;
  const SB_ANON = env.SUPABASE_ANON_KEY || SB_ANON_FALLBACK;
  try {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in.' }, 401);

    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) return json({ error: 'Session expired — sign in again.' }, 401);
    const user = await userRes.json();
    if (!user.id) return json({ error: 'Invalid session.' }, 401);

    const form = await request.formData();
    const files = form.getAll('files').filter(f => f instanceof File);
    if (files.length === 0) return json({ error: 'No images received.' }, 400);
    if (files.length > MAX_FILES) return json({ error: `Maximum ${MAX_FILES} images per upload.` }, 400);

    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type)) return json({ error: 'Unsupported image format.' }, 400);
      if (f.size === 0) return json({ error: 'Empty or corrupted file.' }, 400);
      if (f.size > MAX_BYTES) return json({ error: 'Each image must be under 10 MB.' }, 400);
    }

    const modeRaw = String(form.get('mode') || 'artwork').toLowerCase();
    const isResource = (modeRaw === 'resource' || modeRaw === 'marketplace');
    const cfg = isResource
      ? { resource: true,  prompt: RESOURCE_PROMPT,   categories: RESOURCE_CATEGORIES }
      : { resource: false, prompt: MODERATION_PROMPT,  categories: CATEGORIES };
    const MSG = isResource ? RESOURCE_MESSAGES : MESSAGES;

    const verdicts = await Promise.all(files.map(async f => {
      const b64 = toBase64(await f.arrayBuffer());
      return moderateWithGemini(env, b64, f.type, cfg);
    }));

    let allowed = true;
    let deferred = false;
    let code = isResource ? 'RESOURCE_OK' : 'ARTWORK_OK';
    let reason = 'Approved.';
    let rating = 'SAFE';
    let failIndex = -1;
    const audit = [];
    const calls = verdicts.map(v => decide(v, isResource));

    for (let i = 0; i < verdicts.length; i++) {
      const v = verdicts[i];
      const call = calls[i];

        // A real verdict outranks an outage on another image: if one image was refused, the upload is refused.
      if (!call.pass && !call.deferred && allowed) {
        allowed = false;
        failIndex = i;
        code = call.code;
        reason = (files.length > 1 ? `Image ${i + 1}: ` : '') + (MSG[code] || MSG.UNCLEAR);
      }
      if (v.rating === 'MATURE' && rating === 'SAFE') rating = 'MATURE';

      audit.push({
        i,
        allow: !!v.allow,
        artwork: !!v.artwork,
        resource: !!v.resource,
        ai_generated: !!v.ai_generated,
        rating: v.rating || null,
        quality: v.quality || null,
        category: v.category || null,
        reason: v.reason || null,
        confidence: v.confidence ?? null,
        decision: call.deferred ? 'deferred' : (call.pass ? 'pass' : call.code)
      });
    }

      // Nothing refused, but not every image was seen. Kept and queued for re-check rather than turned away
    if (allowed && calls.some(c => c.deferred)) {
      allowed = false;
      deferred = true;
      code = 'MODERATION_DEFERRED';
      reason = DEFERRED_MESSAGE;
      rating = 'SAFE';
    }

    context.waitUntil(fetch(`${SB_URL}/rest/v1/moderation_logs`, {
      method: 'POST',
      headers: {
        apikey: SB_ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        user_id: user.id,
        allowed,
        code,
        rating,
        confidence: audit[failIndex >= 0 ? failIndex : 0]?.confidence ?? null,
        audit: { images: audit }
      })
    }).catch(() => {}));

    let modToken = null;
    if (allowed && env.MOD_SIGNING_SECRET) {
      try { modToken = await signApproval(env.MOD_SIGNING_SECRET, user.id); } catch { modToken = null; }
    }

    return json({
      allowed,
      deferred,
      rating,
      code,
      failIndex,
      reason,
      token: modToken,
      audit: {
        model: env.GEMINI_MODEL || 'gemini-flash-latest',
        checked_at: new Date().toISOString(),
        images: audit
      }
    }, 200);
  } catch (err) {
    return json({ error: 'Moderation check failed — try again.' }, 500);
  }
}

  // One Gemini verdict into pass/fail, deliberately lopsided: only a confident specific rejection stops an upload
export function decide(v, isResource) {
  const okCode = isResource ? 'RESOURCE_OK' : 'ARTWORK_OK';

    // Never reached the moderator, or came back unreadable. Not a verdict on the artwork, so hold rather than refuse.
  if (!v.ok) return { pass: false, deferred: true, code: 'MODERATION_DEFERRED' };

  let code = (v.category && v.category !== okCode) ? v.category : null;
  if (v.rating === 'ADULT') code = isResource ? 'NSFW_CONTENT' : 'ADULT_CONTENT';

    // explicit and prohibited content stops here whatever else the verdict says
  if (code && HARD_REJECT.includes(code)) return { pass: false, code };

    // AI art accepted nowhere — not artwork, not resource preview. Confident calls only, or polished human work gets swept up
  if (v.ai_generated === true && v.confidence >= REJECT_CONFIDENCE) {
    return { pass: false, code: 'AI_GENERATED' };
  }

  if (v.allow === true) return { pass: true, code: okCode };

    // A rejection with no code, or one the model reaches for when guessing, is not enough to turn an artist away.
  if (!code || SOFT_CODES.includes(code)) return { pass: true, code: okCode };

    // neither is one it is not sure about
  if (!(v.confidence >= REJECT_CONFIDENCE)) return { pass: true, code: okCode };

  return { pass: false, code };
}

export async function moderateWithGemini(env, b64, mimeType, cfg) {
  cfg = cfg || { resource: false, prompt: MODERATION_PROMPT, categories: CATEGORIES };
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const props = cfg.resource
    ? {
        allow: { type: 'BOOLEAN' },
        resource: { type: 'BOOLEAN' },
        rating: { type: 'STRING', enum: ['SAFE', 'MATURE', 'ADULT'] },
        ai_generated: { type: 'BOOLEAN' },
        quality: { type: 'STRING', enum: ['GOOD', 'BAD'] },
        category: { type: 'STRING', enum: cfg.categories },
        reason: { type: 'STRING' },
        confidence: { type: 'NUMBER' }
      }
    : {
        allow: { type: 'BOOLEAN' },
        artwork: { type: 'BOOLEAN' },
        ai_generated: { type: 'BOOLEAN' },
        rating: { type: 'STRING', enum: ['SAFE', 'MATURE', 'ADULT'] },
        quality: { type: 'STRING', enum: ['GOOD', 'BAD'] },
        category: { type: 'STRING', enum: cfg.categories },
        reason: { type: 'STRING' },
        confidence: { type: 'NUMBER' }
      };
  const required = cfg.resource
    ? ['allow', 'resource', 'rating', 'ai_generated', 'quality', 'category', 'reason', 'confidence']
    : ['allow', 'artwork', 'ai_generated', 'rating', 'quality', 'category', 'reason', 'confidence'];

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: b64 } },
        { text: cfg.prompt }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: props, required: required }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      return { ok: false, reason: 'Moderation service unavailable — try again.' };
    }

    const data = await res.json();

    if (data.promptFeedback?.blockReason) {
      return { ok: true, allow: false, artwork: false, resource: false, ai_generated: false,
               rating: 'ADULT', quality: 'BAD', category: 'PROHIBITED_CONTENT',
               reason: 'Blocked by provider safety system.', confidence: 1 };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, reason: 'Moderation returned no verdict — try again.' };

    const v = JSON.parse(text.replace(/```json|```/g, '').trim());
    return {
      ok: true,
      allow: !!v.allow,
      artwork: !!v.artwork,
      resource: !!v.resource,
      ai_generated: !!v.ai_generated,
      rating: v.rating,
      quality: v.quality,
      category: cfg.categories.includes(v.category) ? v.category : 'UNCLEAR',
      reason: (v.reason || '').slice(0, 300),
      confidence: Number(v.confidence) || 0
    };
  } catch {
    return { ok: false, reason: 'Moderation check failed — try again.' };
  }
}

async function signApproval(secret, uid) {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const jti = crypto.randomUUID();
  const msg = `${uid}.${exp}.${jti}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  const sig = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${exp}.${jti}.${sig}`;
}

export function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
