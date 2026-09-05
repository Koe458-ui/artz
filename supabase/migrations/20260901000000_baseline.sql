set check_function_bodies = off;

create extension if not exists pgcrypto      with schema extensions;
create extension if not exists "uuid-ossp"   with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create sequence if not exists public.auth_attempts_id_seq as bigint increment by 1 start with 1 no cycle;
create sequence if not exists public.chat_rate_events_id_seq as bigint increment by 1 start with 1 no cycle;
create sequence if not exists public.dz_abuse_events_id_seq as bigint increment by 1 start with 1 no cycle;
create sequence if not exists public.ledger_entries_seq_seq as bigint increment by 1 start with 1 no cycle;

alter table private.mod_config add constraint mod_config_pkey PRIMARY KEY (id);
alter table private.mod_config add constraint mod_config_singleton CHECK (id);
alter table private.used_mod_tokens add constraint used_mod_tokens_pkey PRIMARY KEY (jti);

alter sequence public.auth_attempts_id_seq owned by public.auth_attempts.id;
alter sequence public.chat_rate_events_id_seq owned by public.chat_rate_events.id;
alter sequence public.dz_abuse_events_id_seq owned by public.dz_abuse_events.id;
alter sequence public.ledger_entries_seq_seq owned by public.ledger_entries.seq;

alter table public.album_items add constraint album_items_pkey PRIMARY KEY (album_id, artwork_id);
alter table public.albums add constraint albums_pkey PRIMARY KEY (id);
alter table public.analytics_events add constraint analytics_events_pkey PRIMARY KEY (id);
alter table public.analytics_goals add constraint analytics_goals_pkey PRIMARY KEY (id);
alter table public.artwork_bookmarks add constraint artwork_bookmarks_pkey PRIMARY KEY (user_id, artwork_id);
alter table public.artwork_download_dedup add constraint artwork_download_dedup_pkey PRIMARY KEY (artwork_id, viewer_key, day);
alter table public.artwork_file add constraint artwork_file_pkey PRIMARY KEY (id);
alter table public.artwork_image add constraint artwork_image_pkey PRIMARY KEY (id);
alter table public.artwork_likes add constraint artwork_likes_pkey PRIMARY KEY (artwork_id, user_id);
alter table public.artwork_reports add constraint artwork_reports_pkey PRIMARY KEY (id);
alter table public.artwork_view_dedup add constraint artwork_view_dedup_pkey PRIMARY KEY (artwork_id, viewer_key, day);
alter table public.artworks add constraint artworks_pkey PRIMARY KEY (id);
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.auth_attempts add constraint auth_attempts_pkey PRIMARY KEY (id);
alter table public.blog_image add constraint blog_image_pkey PRIMARY KEY (id);
alter table public.blog_posts add constraint blog_posts_pkey PRIMARY KEY (id);
alter table public.cart_items add constraint cart_items_pkey PRIMARY KEY (user_id, item_id);
alter table public.chat_cooldowns add constraint chat_cooldowns_pkey PRIMARY KEY (user_id);
alter table public.chat_rate_events add constraint chat_rate_events_pkey PRIMARY KEY (id);
alter table public.comics add constraint comics_pkey PRIMARY KEY (id);
alter table public.comments add constraint comments_pkey PRIMARY KEY (id);
alter table public.communities add constraint communities_pkey PRIMARY KEY (id);
alter table public.community_members add constraint community_members_pkey PRIMARY KEY (community_id, user_id);
alter table public.content_repeats add constraint content_repeats_pkey PRIMARY KEY (user_id, fingerprint);
alter table public.direct_messages add constraint direct_messages_pkey PRIMARY KEY (id);
alter table public.download_events add constraint download_events_pkey PRIMARY KEY (id);
alter table public.dz_abuse_events add constraint dz_abuse_events_pkey PRIMARY KEY (id);
alter table public.dz_secrets add constraint dz_secrets_pkey PRIMARY KEY (name);
alter table public.friendships add constraint friendships_pkey PRIMARY KEY (id);
alter table public.fx_rates add constraint fx_rates_pkey PRIMARY KEY (code);
alter table public.hidden_artworks add constraint hidden_artworks_pkey PRIMARY KEY (user_id, artwork_id);
alter table public.item_bookmarks add constraint item_bookmarks_pkey PRIMARY KEY (kind, subject_id, user_id);
alter table public.item_comments add constraint item_comments_pkey PRIMARY KEY (id);
alter table public.item_likes add constraint item_likes_pkey PRIMARY KEY (kind, subject_id, user_id);
alter table public.item_reports add constraint item_reports_pkey PRIMARY KEY (id);
alter table public.item_view_dedup add constraint item_view_dedup_pkey PRIMARY KEY (kind, subject_id, viewer_key, day);
alter table public.jobs add constraint jobs_pkey PRIMARY KEY (id);
alter table public.ledger_entries add constraint ledger_entries_pkey PRIMARY KEY (seq);
alter table public.marketplace_earnings add constraint marketplace_earnings_pkey PRIMARY KEY (id);
alter table public.marketplace_file add constraint marketplace_file_pkey PRIMARY KEY (id);
alter table public.marketplace_image add constraint marketplace_image_pkey PRIMARY KEY (id);
alter table public.marketplace_items add constraint marketplace_items_pkey PRIMARY KEY (id);
alter table public.moderation_logs add constraint moderation_logs_pkey PRIMARY KEY (id);
alter table public.notification_reads add constraint notification_reads_pkey PRIMARY KEY (user_id, notification_id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.partner_commissions add constraint partner_commissions_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.payout_methods add constraint payout_methods_pkey PRIMARY KEY (id);
alter table public.payout_requests add constraint payout_requests_pkey PRIMARY KEY (id);
alter table public.platform_tax_config add constraint platform_tax_config_pkey PRIMARY KEY (id);
alter table public.profile_banner_image add constraint profile_banner_image_pkey PRIMARY KEY (id);
alter table public.profile_creds add constraint profile_creds_pkey PRIMARY KEY (id);
alter table public.profile_image add constraint profile_image_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.promo_codes add constraint promo_codes_pkey PRIMARY KEY (id);
alter table public.rate_hits add constraint rate_hits_pkey PRIMARY KEY (bucket, window_start);
alter table public.reconciliation_flags add constraint reconciliation_flags_pkey PRIMARY KEY (id);
alter table public.reserved_names add constraint reserved_names_pkey PRIMARY KEY (name);
alter table public.resources add constraint resources_pkey PRIMARY KEY (id);
alter table public.resources_file add constraint resources_file_pkey PRIMARY KEY (id);
alter table public.resources_image add constraint resources_image_pkey PRIMARY KEY (id);
alter table public.scheduled_sections add constraint scheduled_sections_pkey PRIMARY KEY (id);
alter table public.scheduled_uploads add constraint scheduled_uploads_pkey PRIMARY KEY (id);
alter table public.seller_tax add constraint seller_tax_pkey PRIMARY KEY (user_id);
alter table public.settings add constraint settings_pkey PRIMARY KEY (key);
alter table public.settlement_windows add constraint settlement_windows_pkey PRIMARY KEY (provider, scope);
alter table public.subscription_prices add constraint subscription_prices_pkey PRIMARY KEY (plan, currency);
alter table public.support_limits add constraint support_limits_pkey PRIMARY KEY (currency);
alter table public.tax_remittances add constraint tax_remittances_pkey PRIMARY KEY (id);
alter table public.upload_events add constraint upload_events_pkey PRIMARY KEY (id);
alter table public.user_bans add constraint user_bans_pkey PRIMARY KEY (id);
alter table public.user_reports add constraint user_reports_pkey PRIMARY KEY (id);
alter table public.user_tag_prefs add constraint user_tag_prefs_pkey PRIMARY KEY (user_id, tag);
alter table public.artwork_reports add constraint artwork_reports_artwork_id_reporter_id_key UNIQUE (artwork_id, reporter_id);
alter table public.blog_posts add constraint blog_posts_slug_key UNIQUE (slug);
alter table public.communities add constraint communities_one_per_owner UNIQUE (owner_id);
alter table public.marketplace_earnings add constraint earnings_one_per_payment UNIQUE (payment_id);
alter table public.payments add constraint payments_rzp_order_id_key UNIQUE (rzp_order_id);
alter table public.profile_banner_image add constraint profile_banner_image_user_id_key UNIQUE (user_id);
alter table public.profile_creds add constraint profile_creds_giver_id_receiver_id_key UNIQUE (giver_id, receiver_id);
alter table public.profile_image add constraint profile_image_user_id_key UNIQUE (user_id);
alter table public.profiles add constraint profiles_email_key UNIQUE (email);
alter table public.tax_remittances add constraint tax_remittances_kind_period_key UNIQUE (kind, period);
alter table public.albums add constraint albums_name_len CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 40)));
alter table public.albums add constraint albums_name_reserved CHECK ((lower(btrim(name)) <> ALL (ARRAY['like'::text, 'likes'::text, 'bookmark'::text, 'bookmarks'::text])));
alter table public.analytics_events add constraint an_ev_country CHECK (((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text)));
alter table public.analytics_events add constraint an_ev_device CHECK ((device = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text, 'unknown'::text])));
alter table public.analytics_events add constraint an_ev_event CHECK ((event = ANY (ARRAY['view'::text, 'like'::text, 'unlike'::text, 'bookmark'::text, 'unbookmark'::text, 'download'::text, 'comment'::text, 'share'::text, 'profile_view'::text, 'search_impression'::text, 'search_click'::text, 'follow'::text, 'unfollow'::text, 'cred'::text])));
alter table public.analytics_events add constraint an_ev_ref CHECK (((referrer_host IS NULL) OR ((char_length(referrer_host) >= 1) AND (char_length(referrer_host) <= 120))));
alter table public.analytics_events add constraint an_ev_scope CHECK ((scope = ANY (ARRAY['artwork'::text, 'marketplace'::text, 'blog'::text, 'resource'::text, 'profile'::text])));
alter table public.analytics_events add constraint an_ev_source CHECK ((source = ANY (ARRAY['direct'::text, 'social'::text, 'search'::text, 'referral'::text, 'internal'::text])));
alter table public.analytics_events add constraint an_ev_term CHECK (((term IS NULL) OR ((char_length(term) >= 1) AND (char_length(term) <= 80))));
alter table public.analytics_events add constraint an_ev_vkey CHECK (((char_length(viewer_key) >= 3) AND (char_length(viewer_key) <= 80)));
alter table public.analytics_goals add constraint an_goal_metric CHECK ((metric = ANY (ARRAY['views'::text, 'likes'::text, 'bookmarks'::text, 'downloads'::text, 'comments'::text, 'uploads'::text, 'sales'::text])));
alter table public.analytics_goals add constraint an_goal_period CHECK ((period = ANY (ARRAY['7d'::text, '30d'::text, '90d'::text, 'all'::text])));
alter table public.analytics_goals add constraint an_goal_scope CHECK ((scope = ANY (ARRAY['artwork'::text, 'marketplace'::text, 'blog'::text, 'resource'::text])));
alter table public.analytics_goals add constraint an_goal_target CHECK (((target >= 1) AND (target <= 100000000)));
alter table public.artwork_reports add constraint artwork_reports_details_ck CHECK (((details IS NULL) OR (char_length(details) <= 1000)));
alter table public.artwork_reports add constraint artwork_reports_reason_ck CHECK ((reason = ANY (ARRAY['copyright'::text, 'ai_undisclosed'::text, 'nudity'::text, 'violence'::text, 'hate'::text, 'spam'::text, 'misinformation'::text, 'impersonation'::text, 'illegal'::text, 'offtopic'::text, 'lowquality'::text, 'other'::text])));
alter table public.artwork_reports add constraint artwork_reports_status_ck CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text])));
alter table public.artworks add constraint art_category_n CHECK ((cardinality(category) <= 5));
alter table public.artworks add constraint art_credits_n CHECK ((cardinality(credits) <= 20));
alter table public.artworks add constraint art_description_len CHECK (((description IS NULL) OR ((char_length(btrim(description)) >= 20) AND (char_length(btrim(description)) <= 5000)))) NOT VALID;
alter table public.artworks add constraint art_dims_rng CHECK ((((width IS NULL) OR ((width >= 1) AND (width <= 100000))) AND ((height IS NULL) OR ((height >= 1) AND (height <= 100000)))));
alter table public.artworks add constraint art_file_size_rng CHECK (((file_size IS NULL) OR ((file_size >= 0) AND (file_size <= 26214400))));
alter table public.artworks add constraint art_license_len CHECK (((license IS NULL) OR ((char_length(btrim(license)) >= 3) AND (char_length(btrim(license)) <= 100))));
alter table public.artworks add constraint art_links_n CHECK ((cardinality(external_links) <= 5));
alter table public.artworks add constraint art_medium_len CHECK (((medium IS NULL) OR ((char_length(btrim(medium)) >= 2) AND (char_length(btrim(medium)) <= 50))));
alter table public.artworks add constraint art_name_len CHECK (((name IS NULL) OR ((char_length(btrim(name)) >= 3) AND (char_length(btrim(name)) <= 100)))) NOT VALID;
alter table public.artworks add constraint art_pages_n CHECK (((pages IS NULL) OR (jsonb_typeof(pages) <> 'array'::text) OR (jsonb_array_length(pages) <= 10)));
alter table public.artworks add constraint art_process_len CHECK (((process_notes IS NULL) OR ((char_length(btrim(process_notes)) >= 20) AND (char_length(btrim(process_notes)) <= 3000))));
alter table public.artworks add constraint art_seo_desc_len CHECK (((seo_description IS NULL) OR ((char_length(btrim(seo_description)) >= 50) AND (char_length(btrim(seo_description)) <= 160))));
alter table public.artworks add constraint art_seo_title_len CHECK (((seo_title IS NULL) OR ((char_length(btrim(seo_title)) >= 10) AND (char_length(btrim(seo_title)) <= 70))));
alter table public.artworks add constraint art_slug_len CHECK (((slug IS NULL) OR ((char_length(btrim(slug)) >= 3) AND (char_length(btrim(slug)) <= 120))));
alter table public.artworks add constraint art_software_n CHECK ((cardinality(software_list) <= 10));
alter table public.artworks add constraint art_subject_len CHECK (((subject_matter IS NULL) OR ((char_length(btrim(subject_matter)) >= 2) AND (char_length(btrim(subject_matter)) <= 100))));
alter table public.artworks add constraint art_summary_len CHECK (((summary IS NULL) OR ((char_length(btrim(summary)) >= 20) AND (char_length(btrim(summary)) <= 250))));
alter table public.artworks add constraint art_tags_n CHECK ((cardinality(tags) <= 10));
alter table public.artworks add constraint art_visibility_vals CHECK ((visibility = ANY (ARRAY['draft'::text, 'published'::text, 'scheduled'::text, 'hidden'::text])));
alter table public.artworks add constraint artworks_category_valid CHECK (((category <@ ARRAY['characters'::text, 'anime'::text, 'manga'::text, 'comic'::text, 'fan-art'::text, 'chibi'::text, 'sketches'::text, 'illustrations'::text, 'concept-art'::text, 'ai-art'::text, 'digital-art'::text, 'traditional-art'::text, 'abstract'::text, 'typography'::text, 'poster-art'::text, 'logos'::text, 'icons'::text, 'wallpapers'::text, 'cars'::text, 'bikes'::text, 'trucks'::text, 'buses'::text, 'aircraft'::text, 'ships'::text, 'robots'::text, 'mecha'::text, 'weapons'::text, 'fantasy'::text, 'dragons'::text, 'monsters'::text, 'mythology'::text, 'sci-fi'::text, 'space'::text, 'nature'::text, 'animals'::text, 'birds'::text, 'marine-life'::text, 'landscapes'::text, 'scenery'::text, 'cityscape'::text, 'architecture'::text, 'buildings'::text, 'interior-design'::text, 'food-art'::text, 'flowers'::text, 'trees'::text, 'patterns'::text, '3d-art'::text, 'pixel-art'::text, 'aesthetic-art'::text, 'others'::text]) AND (array_length(category, 1) > 0)));
alter table public.artworks add constraint artworks_content_rating_check CHECK ((content_rating = ANY (ARRAY['SAFE'::text, 'MATURE'::text])));
alter table public.artworks add constraint artworks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.artworks add constraint artworks_tags_max10 CHECK (((array_length(tags, 1) IS NULL) OR (array_length(tags, 1) <= 10)));
alter table public.artworks add constraint artworks_thumb_zoom_range CHECK (((thumb_zoom >= (1)::numeric) AND (thumb_zoom <= (2)::numeric)));
alter table public.audit_log add constraint audit_action_len CHECK (((char_length(action) >= 2) AND (char_length(action) <= 64)));
alter table public.auth_attempts add constraint auth_attempts_event_check CHECK ((event = ANY (ARRAY['login'::text, 'signup'::text, 'logout'::text, 'recover'::text])));
alter table public.blog_posts add constraint blog_author_bio_len CHECK (((author_bio IS NULL) OR ((char_length(btrim(author_bio)) >= 20) AND (char_length(btrim(author_bio)) <= 500))));
alter table public.blog_posts add constraint blog_category_n CHECK ((cardinality(category) <= 5));
alter table public.blog_posts add constraint blog_content_type_len CHECK (((content_type IS NULL) OR ((char_length(btrim(content_type)) >= 3) AND (char_length(btrim(content_type)) <= 30))));
alter table public.blog_posts add constraint blog_external_refs_n CHECK ((cardinality(external_refs) <= 20));
alter table public.blog_posts add constraint blog_posts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.blog_posts add constraint blog_read_minutes_rng CHECK (((read_minutes >= 1) AND (read_minutes <= 2000)));
alter table public.blog_posts add constraint blog_related_art_n CHECK ((cardinality(related_artworks) <= 10));
alter table public.blog_posts add constraint blog_related_items_n CHECK ((cardinality(related_items) <= 10));
alter table public.blog_posts add constraint blog_seo_desc_len CHECK (((seo_description IS NULL) OR ((char_length(btrim(seo_description)) >= 50) AND (char_length(btrim(seo_description)) <= 160))));
alter table public.blog_posts add constraint blog_seo_title_len CHECK (((seo_title IS NULL) OR ((char_length(btrim(seo_title)) >= 10) AND (char_length(btrim(seo_title)) <= 70))));
alter table public.blog_posts add constraint blog_tags_n CHECK ((cardinality(tags) <= 10));
alter table public.blog_posts add constraint blog_visibility_vals CHECK ((visibility = ANY (ARRAY['draft'::text, 'published'::text, 'scheduled'::text, 'hidden'::text])));
alter table public.comics add constraint comics_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.comics add constraint comics_tags_max10 CHECK (((array_length(tags, 1) IS NULL) OR (array_length(tags, 1) <= 10)));
alter table public.comments add constraint comments_channel_check CHECK (((channel = ANY (ARRAY['official'::text, 'arttalk'::text, 'feedback'::text, 'collab'::text, 'tips'::text, 'showcase'::text])) OR (channel ~ '^c:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text)));
alter table public.comments add constraint comments_len_chk CHECK (((char_length(comment_text) >= 1) AND (char_length(comment_text) <= 1000)));
alter table public.comments add constraint comments_showcase_requires_image CHECK (((channel <> 'showcase'::text) OR ((image_url IS NOT NULL) AND (comment_text IS NOT NULL) AND (length(TRIM(BOTH FROM comment_text)) > 0))));
alter table public.communities add constraint communities_desc_len CHECK (((description IS NULL) OR (char_length(description) <= 500)));
alter table public.communities add constraint communities_name_len CHECK (((char_length(btrim(name)) >= 3) AND (char_length(btrim(name)) <= 40)));
alter table public.communities add constraint communities_rules_len CHECK (((rules IS NULL) OR (char_length(rules) <= 2000)));
alter table public.communities add constraint communities_text_len_chk CHECK ((((char_length(btrim(name)) >= 3) AND (char_length(btrim(name)) <= 40)) AND (char_length(COALESCE(short_description, ''::text)) <= 120) AND (char_length(COALESCE(description, ''::text)) <= 500) AND (char_length(COALESCE(rules, ''::text)) <= 2000)));
alter table public.community_members add constraint cm_role_ck CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'sr_mod'::text, 'jr_mod'::text, 'member'::text])));
alter table public.direct_messages add constraint direct_messages_len_chk CHECK (((char_length(content) >= 1) AND (char_length(content) <= 1000)));
alter table public.direct_messages add constraint dm_length CHECK (((char_length(btrim(content)) >= 1) AND (char_length(btrim(content)) <= 1000)));
alter table public.direct_messages add constraint dm_no_links CHECK ((content !~* '(https?://|www\.|\S+\.(com|net|org|io|gg|xyz)(\s|/|$))'::text));
alter table public.direct_messages add constraint dm_not_self CHECK ((sender_id <> recipient_id));
alter table public.download_events add constraint download_events_kind_ck CHECK ((kind = ANY (ARRAY['artwork'::text, 'resource'::text, 'blog'::text])));
alter table public.friendships add constraint friendships_check CHECK ((requester_id <> addressee_id));
alter table public.friendships add constraint friendships_check1 CHECK (((status = 'blocked'::text) = (blocked_by IS NOT NULL)));
alter table public.friendships add constraint friendships_check2 CHECK (((blocked_by IS NULL) OR ((blocked_by = requester_id) OR (blocked_by = addressee_id))));
alter table public.friendships add constraint friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text])));
alter table public.item_bookmarks add constraint item_bookmarks_kind_check CHECK ((kind = ANY (ARRAY['resource'::text, 'blog'::text, 'marketplace'::text])));
alter table public.item_comments add constraint item_comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000)));
alter table public.item_comments add constraint item_comments_kind_check CHECK ((kind = ANY (ARRAY['artwork'::text, 'resource'::text, 'blog'::text, 'marketplace'::text])));
alter table public.item_comments add constraint item_comments_len_chk CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000)));
alter table public.item_likes add constraint item_likes_kind_check CHECK ((kind = ANY (ARRAY['resource'::text, 'blog'::text, 'marketplace'::text])));
alter table public.item_reports add constraint item_reports_kind_check CHECK ((kind = ANY (ARRAY['artwork'::text, 'resource'::text, 'blog'::text, 'marketplace'::text, 'job'::text, 'community'::text, 'community_member'::text, 'community_message'::text])));
alter table public.item_reports add constraint item_reports_reason_check CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 500)));
alter table public.item_view_dedup add constraint item_view_kind CHECK ((kind = ANY (ARRAY['marketplace'::text, 'blog'::text, 'resource'::text])));
alter table public.jobs add constraint jobs_about_company_len CHECK (((about_company IS NULL) OR ((char_length(btrim(about_company)) >= 50) AND (char_length(btrim(about_company)) <= 2000))));
alter table public.jobs add constraint jobs_app_instructions_len CHECK (((application_instructions IS NULL) OR ((char_length(btrim(application_instructions)) >= 20) AND (char_length(btrim(application_instructions)) <= 1500))));
alter table public.jobs add constraint jobs_app_materials_len CHECK (((application_materials IS NULL) OR ((char_length(btrim(application_materials)) >= 10) AND (char_length(btrim(application_materials)) <= 1000))));
alter table public.jobs add constraint jobs_app_questions_len CHECK (((application_questions IS NULL) OR ((char_length(btrim(application_questions)) >= 5) AND (char_length(btrim(application_questions)) <= 1000))));
alter table public.jobs add constraint jobs_applicant_countries_n CHECK ((cardinality(applicant_countries) <= 60));
alter table public.jobs add constraint jobs_apply_email_len CHECK (((apply_email IS NULL) OR ((char_length(btrim(apply_email)) >= 5) AND (char_length(btrim(apply_email)) <= 254))));
alter table public.jobs add constraint jobs_apply_url_len CHECK (((apply_url IS NULL) OR ((char_length(btrim(apply_url)) >= 10) AND (char_length(btrim(apply_url)) <= 200))));
alter table public.jobs add constraint jobs_benefits_len CHECK (((benefits IS NULL) OR ((char_length(btrim(benefits)) >= 20) AND (char_length(btrim(benefits)) <= 2000))));
alter table public.jobs add constraint jobs_city_len CHECK (((location_city IS NULL) OR ((char_length(btrim(location_city)) >= 2) AND (char_length(btrim(location_city)) <= 100))));
alter table public.jobs add constraint jobs_company_url_len CHECK (((company_url IS NULL) OR ((char_length(btrim(company_url)) >= 5) AND (char_length(btrim(company_url)) <= 200))));
alter table public.jobs add constraint jobs_contract_dur_len CHECK (((contract_duration IS NULL) OR ((char_length(btrim(contract_duration)) >= 2) AND (char_length(btrim(contract_duration)) <= 100))));
alter table public.jobs add constraint jobs_description_check CHECK ((length(btrim(description)) >= 80));
alter table public.jobs add constraint jobs_employment_type_check CHECK ((employment_type = ANY (ARRAY['FULL_TIME'::text, 'PART_TIME'::text, 'CONTRACTOR'::text, 'TEMPORARY'::text, 'INTERN'::text, 'VOLUNTEER'::text, 'PER_DIEM'::text, 'OTHER'::text])));
alter table public.jobs add constraint jobs_experience_level_len CHECK (((experience_level IS NULL) OR ((char_length(btrim(experience_level)) >= 2) AND (char_length(btrim(experience_level)) <= 20))));
alter table public.jobs add constraint jobs_needs_apply_route CHECK (((apply_url IS NOT NULL) OR (apply_email IS NOT NULL)));
alter table public.jobs add constraint jobs_nice_skills_len CHECK (((nice_to_have_skills IS NULL) OR ((char_length(btrim(nice_to_have_skills)) >= 10) AND (char_length(btrim(nice_to_have_skills)) <= 1000))));
alter table public.jobs add constraint jobs_onsite_needs_country CHECK ((is_remote OR (location_country IS NOT NULL)));
alter table public.jobs add constraint jobs_openings_rng CHECK (((openings IS NULL) OR ((openings >= 1) AND (openings <= 999))));
alter table public.jobs add constraint jobs_remote_needs_country CHECK (((NOT is_remote) OR (cardinality(applicant_countries) > 0)));
alter table public.jobs add constraint jobs_required_skills_len CHECK (((required_skills IS NULL) OR ((char_length(btrim(required_skills)) >= 10) AND (char_length(btrim(required_skills)) <= 1000))));
alter table public.jobs add constraint jobs_requirements_len CHECK (((requirements IS NULL) OR ((char_length(btrim(requirements)) >= 50) AND (char_length(btrim(requirements)) <= 3000))));
alter table public.jobs add constraint jobs_responsibilities_len CHECK (((responsibilities IS NULL) OR ((char_length(btrim(responsibilities)) >= 50) AND (char_length(btrim(responsibilities)) <= 3000))));
alter table public.jobs add constraint jobs_salary_nonneg CHECK ((((salary_min IS NULL) OR (salary_min >= (0)::numeric)) AND ((salary_max IS NULL) OR (salary_max >= (0)::numeric))));
alter table public.jobs add constraint jobs_salary_range CHECK (((salary_max IS NULL) OR (salary_min IS NULL) OR (salary_max >= salary_min)));
alter table public.jobs add constraint jobs_salary_unit_check CHECK ((salary_unit = ANY (ARRAY['HOUR'::text, 'DAY'::text, 'WEEK'::text, 'MONTH'::text, 'YEAR'::text])));
alter table public.jobs add constraint jobs_schedule_len CHECK (((schedule IS NULL) OR ((char_length(btrim(schedule)) >= 3) AND (char_length(btrim(schedule)) <= 100))));
alter table public.jobs add constraint jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])));
alter table public.jobs add constraint jobs_timezone_len CHECK (((timezone IS NULL) OR ((char_length(btrim(timezone)) >= 3) AND (char_length(btrim(timezone)) <= 50))));
alter table public.jobs add constraint jobs_title_check CHECK (((length(btrim(title)) >= 2) AND (length(btrim(title)) <= 140)));
alter table public.jobs add constraint jobs_visibility_vals CHECK ((visibility = ANY (ARRAY['public'::text, 'unlisted'::text, 'private'::text])));
alter table public.jobs add constraint jobs_work_mode_vals CHECK (((work_mode IS NULL) OR (work_mode = ANY (ARRAY['remote'::text, 'onsite'::text, 'hybrid'::text]))));
alter table public.jobs add constraint jobs_working_hours_len CHECK (((working_hours IS NULL) OR ((char_length(btrim(working_hours)) >= 3) AND (char_length(btrim(working_hours)) <= 100))));
alter table public.jobs add constraint jobs_years_experience_rng CHECK (((years_experience IS NULL) OR ((years_experience >= 0) AND (years_experience <= 60))));
alter table public.ledger_entries add constraint ledger_entries_amount_check CHECK ((amount > 0));
alter table public.ledger_entries add constraint ledger_entries_direction_check CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text])));
alter table public.ledger_entries add constraint ledger_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['sale_credit'::text, 'payout_debit'::text, 'reversal_debit'::text, 'tds_debit'::text, 'adjustment'::text])));
alter table public.marketplace_earnings add constraint earnings_splits_add_up CHECK ((((((gateway_fee + fee_amount) + tds_amount) + tcs_amount) + net_amount) = gross_amount));
alter table public.marketplace_earnings add constraint marketplace_earnings_fee_amount_check CHECK ((fee_amount >= 0));
alter table public.marketplace_earnings add constraint marketplace_earnings_fee_bps_check CHECK (((fee_bps >= 0) AND (fee_bps <= 10000)));
alter table public.marketplace_earnings add constraint marketplace_earnings_gross_amount_check CHECK ((gross_amount > 0));
alter table public.marketplace_earnings add constraint marketplace_earnings_net_amount_check CHECK ((net_amount >= 0));
alter table public.marketplace_earnings add constraint marketplace_earnings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'available'::text, 'reversed'::text, 'paid_out'::text])));
alter table public.marketplace_items add constraint marketplace_digital_needs_file CHECK (((item_type <> 'digital'::text) OR (file_url IS NOT NULL) OR (file_storage_path IS NOT NULL)));
alter table public.marketplace_items add constraint marketplace_items_item_type_check CHECK ((item_type = ANY (ARRAY['digital'::text, 'commission'::text, 'service'::text])));
alter table public.marketplace_items add constraint marketplace_items_license_check CHECK ((license = ANY (ARRAY['standard'::text, 'extended'::text, 'exclusive'::text, 'custom'::text])));
alter table public.marketplace_items add constraint marketplace_items_price_cents_check CHECK ((price_cents >= 0));
alter table public.marketplace_items add constraint marketplace_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.marketplace_items add constraint mk_apply_email_len CHECK (((apply_email IS NULL) OR ((char_length(btrim(apply_email)) >= 5) AND (char_length(btrim(apply_email)) <= 254))));
alter table public.marketplace_items add constraint mk_apply_url_len CHECK (((apply_url IS NULL) OR ((char_length(btrim(apply_url)) >= 10) AND (char_length(btrim(apply_url)) <= 200))));
alter table public.marketplace_items add constraint mk_buyer_gets_len CHECK (((buyer_gets IS NULL) OR ((char_length(btrim(buyer_gets)) >= 20) AND (char_length(btrim(buyer_gets)) <= 3000))));
alter table public.marketplace_items add constraint mk_delivery_days_rng CHECK (((delivery_days IS NULL) OR ((delivery_days >= 0) AND (delivery_days <= 365))));
alter table public.marketplace_items add constraint mk_delivery_notes_len CHECK (((delivery_notes IS NULL) OR ((char_length(btrim(delivery_notes)) >= 20) AND (char_length(btrim(delivery_notes)) <= 1000))));
alter table public.marketplace_items add constraint mk_delivery_type_vals CHECK ((delivery_type = ANY (ARRAY['instant'::text, 'custom'::text])));
alter table public.marketplace_items add constraint mk_dimensions_len CHECK (((dimensions IS NULL) OR ((char_length(btrim(dimensions)) >= 2) AND (char_length(btrim(dimensions)) <= 50))));
alter table public.marketplace_items add constraint mk_file_count_rng CHECK (((file_count IS NULL) OR ((file_count >= 1) AND (file_count <= 9999))));
alter table public.marketplace_items add constraint mk_file_format_len CHECK (((file_format IS NULL) OR ((char_length(btrim(file_format)) >= 2) AND (char_length(btrim(file_format)) <= 100))));
alter table public.marketplace_items add constraint mk_file_size_rng CHECK (((file_size_mb IS NULL) OR ((file_size_mb >= (0)::numeric) AND (file_size_mb <= (100000)::numeric))));
alter table public.marketplace_items add constraint mk_gallery_n CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) <> 'array'::text) OR (jsonb_array_length(gallery) <= 8)));
alter table public.marketplace_items add constraint mk_internal_notes_len CHECK (((internal_notes IS NULL) OR ((char_length(btrim(internal_notes)) >= 20) AND (char_length(btrim(internal_notes)) <= 1000))));
alter table public.marketplace_items add constraint mk_product_type_len CHECK (((product_type IS NULL) OR ((char_length(btrim(product_type)) >= 3) AND (char_length(btrim(product_type)) <= 30))));
alter table public.marketplace_items add constraint mk_refund_policy_len CHECK (((refund_policy IS NULL) OR ((char_length(btrim(refund_policy)) >= 20) AND (char_length(btrim(refund_policy)) <= 500))));
alter table public.marketplace_items add constraint mk_revision_rng CHECK (((revision_count IS NULL) OR ((revision_count >= 0) AND (revision_count <= 99))));
alter table public.marketplace_items add constraint mk_safety_notes_len CHECK (((safety_notes IS NULL) OR ((char_length(btrim(safety_notes)) >= 20) AND (char_length(btrim(safety_notes)) <= 500))));
alter table public.marketplace_items add constraint mk_sale_below_price CHECK (((sale_price_cents IS NULL) OR (sale_price_cents < price_cents)));
alter table public.marketplace_items add constraint mk_sale_price_rng CHECK (((sale_price_cents IS NULL) OR (sale_price_cents >= 0)));
alter table public.marketplace_items add constraint mk_seller_note_len CHECK (((seller_note IS NULL) OR ((char_length(btrim(seller_note)) >= 20) AND (char_length(btrim(seller_note)) <= 500))));
alter table public.marketplace_items add constraint mk_seo_desc_len CHECK (((seo_description IS NULL) OR ((char_length(btrim(seo_description)) >= 50) AND (char_length(btrim(seo_description)) <= 160))));
alter table public.marketplace_items add constraint mk_seo_title_len CHECK (((seo_title IS NULL) OR ((char_length(btrim(seo_title)) >= 3) AND (char_length(btrim(seo_title)) <= 80))));
alter table public.marketplace_items add constraint mk_slug_len CHECK (((slug IS NULL) OR ((char_length(btrim(slug)) >= 3) AND (char_length(btrim(slug)) <= 120))));
alter table public.marketplace_items add constraint mk_software_len CHECK (((software IS NULL) OR ((char_length(btrim(software)) >= 2) AND (char_length(btrim(software)) <= 100))));
alter table public.marketplace_items add constraint mk_stock_rng CHECK (((stock IS NULL) OR ((stock >= 0) AND (stock <= 999999))));
alter table public.marketplace_items add constraint mk_subcategory_len CHECK (((subcategory IS NULL) OR ((char_length(btrim(subcategory)) >= 2) AND (char_length(btrim(subcategory)) <= 50))));
alter table public.marketplace_items add constraint mk_summary_len CHECK (((summary IS NULL) OR ((char_length(btrim(summary)) >= 20) AND (char_length(btrim(summary)) <= 200))));
alter table public.marketplace_items add constraint mk_support_period_len CHECK (((support_period IS NULL) OR ((char_length(btrim(support_period)) >= 2) AND (char_length(btrim(support_period)) <= 50))));
alter table public.marketplace_items add constraint mk_tags_n CHECK ((cardinality(tags) <= 10));
alter table public.marketplace_items add constraint mk_visibility_vals CHECK ((visibility = ANY (ARRAY['draft'::text, 'published'::text, 'hidden'::text])));
alter table public.notifications add constraint notifications_type_check CHECK ((type = ANY (ARRAY['admin'::text, 'artwork_approved'::text, 'artwork_rejected'::text, 'comic_approved'::text, 'comic_rejected'::text, 'post_published'::text, 'post_rejected'::text])));
alter table public.partner_commissions add constraint pc_amounts CHECK (((gross_amount >= 0) AND (amount >= 0) AND ((rate_bps >= 0) AND (rate_bps <= 10000))));
alter table public.partner_commissions add constraint pc_cur CHECK ((currency ~ '^[A-Z]{3}$'::text));
alter table public.partner_commissions add constraint pc_kind CHECK ((kind = ANY (ARRAY['marketplace'::text, 'subscription'::text])));
alter table public.partner_commissions add constraint pc_payout CHECK ((payout_status = ANY (ARRAY['wallet_credited'::text, 'paid_direct'::text, 'reversed'::text])));
alter table public.partner_commissions add constraint pc_source CHECK ((num_nonnulls(earning_id, payment_id) = 1));
alter table public.payments add constraint payments_amount_check CHECK ((amount > 0));
alter table public.payments add constraint payments_kind_check CHECK ((kind = ANY (ARRAY['subscription'::text, 'marketplace'::text])));
alter table public.payments add constraint payments_provider_check CHECK ((provider = ANY (ARRAY['razorpay'::text, 'paypal'::text])));
alter table public.payments add constraint payments_provider_ref_check CHECK ((((provider = 'razorpay'::text) AND (rzp_order_id IS NOT NULL) AND (pp_order_id IS NULL)) OR ((provider = 'paypal'::text) AND (pp_order_id IS NOT NULL) AND (rzp_order_id IS NULL))));
alter table public.payments add constraint payments_status_check CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'failed'::text, 'refunded'::text])));
alter table public.payout_methods add constraint payout_method_shape CHECK ((((kind = 'paypal_email'::text) AND (paypal_email IS NOT NULL) AND (upi_vpa IS NULL) AND (bank_last4 IS NULL)) OR ((kind = 'upi'::text) AND (upi_vpa IS NOT NULL) AND (paypal_email IS NULL) AND (bank_last4 IS NULL)) OR ((kind = 'bank_account'::text) AND (bank_last4 IS NOT NULL) AND (holder_name IS NOT NULL) AND (paypal_email IS NULL) AND (upi_vpa IS NULL))));
alter table public.payout_methods add constraint payout_methods_bank_last4_check CHECK (((bank_last4 IS NULL) OR (bank_last4 ~ '^[0-9]{4}$'::text)));
alter table public.payout_methods add constraint payout_methods_kind_check CHECK ((kind = ANY (ARRAY['paypal_email'::text, 'upi'::text, 'bank_account'::text])));
alter table public.payout_methods add constraint payout_methods_provider_check CHECK ((provider = ANY (ARRAY['paypal'::text, 'razorpay'::text])));
alter table public.payout_requests add constraint payout_requests_amount_check CHECK ((amount > 0));
alter table public.payout_requests add constraint payout_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'processing'::text, 'paid'::text, 'rejected'::text, 'failed'::text])));
alter table public.platform_tax_config add constraint platform_tax_config_id_check CHECK ((id = 1));
alter table public.profile_creds add constraint profile_creds_check CHECK ((giver_id <> receiver_id));
alter table public.profiles add constraint profiles_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'INR'::text, 'EUR'::text, 'GBP'::text, 'JPY'::text, 'AUD'::text, 'CAD'::text, 'SGD'::text, 'CHF'::text, 'HKD'::text, 'NZD'::text, 'SEK'::text])));
alter table public.profiles add constraint profiles_display_name_len CHECK (((display_name IS NULL) OR ((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 30))));
alter table public.profiles add constraint profiles_merit_range CHECK (((merit >= 0) AND (merit <= 100)));
alter table public.profiles add constraint profiles_role_known CHECK (((role IS NULL) OR (role = ANY (ARRAY['guest'::text, 'premium'::text, 'admin'::text, 'dev'::text, 'partner'::text]))));
alter table public.promo_codes add constraint promo_code_shape CHECK ((code ~ '^[A-Z0-9]{4,6}$'::text));
alter table public.promo_codes add constraint promo_usage_nonneg CHECK ((usage_count >= 0));
alter table public.reconciliation_flags add constraint reconciliation_flags_kind_check CHECK ((kind = ANY (ARRAY['balance_mismatch'::text, 'chain_broken'::text, 'overdraw_attempt'::text])));
alter table public.reconciliation_flags add constraint reconciliation_flags_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text])));
alter table public.reserved_names add constraint reserved_names_mode_check CHECK ((mode = ANY (ARRAY['exact'::text, 'contains'::text])));
alter table public.resources add constraint res_category_n CHECK ((cardinality(category) <= 5));
alter table public.resources add constraint res_compat_sw_n CHECK ((cardinality(compatible_software) <= 10));
alter table public.resources add constraint res_compat_ver_len CHECK (((compatible_versions IS NULL) OR ((char_length(btrim(compatible_versions)) >= 2) AND (char_length(btrim(compatible_versions)) <= 200))));
alter table public.resources add constraint res_dimensions_len CHECK (((dimensions IS NULL) OR ((char_length(btrim(dimensions)) >= 2) AND (char_length(btrim(dimensions)) <= 50))));
alter table public.resources add constraint res_file_count_rng CHECK (((file_count IS NULL) OR ((file_count >= 1) AND (file_count <= 100000))));
alter table public.resources add constraint res_included_len CHECK (((whats_included IS NULL) OR ((char_length(btrim(whats_included)) >= 20) AND (char_length(btrim(whats_included)) <= 2000))));
alter table public.resources add constraint res_instructions_len CHECK (((instructions IS NULL) OR ((char_length(btrim(instructions)) >= 20) AND (char_length(btrim(instructions)) <= 3000))));
alter table public.resources add constraint res_links_n CHECK ((cardinality(external_links) <= 5));
alter table public.resources add constraint res_safety_len CHECK (((safety_notes IS NULL) OR ((char_length(btrim(safety_notes)) >= 20) AND (char_length(btrim(safety_notes)) <= 500))));
alter table public.resources add constraint res_seo_desc_len CHECK (((seo_description IS NULL) OR ((char_length(btrim(seo_description)) >= 50) AND (char_length(btrim(seo_description)) <= 160))));
alter table public.resources add constraint res_seo_title_len CHECK (((seo_title IS NULL) OR ((char_length(btrim(seo_title)) >= 10) AND (char_length(btrim(seo_title)) <= 70))));
alter table public.resources add constraint res_slug_len CHECK (((slug IS NULL) OR ((char_length(btrim(slug)) >= 3) AND (char_length(btrim(slug)) <= 120))));
alter table public.resources add constraint res_software_len CHECK (((software IS NULL) OR ((char_length(btrim(software)) >= 2) AND (char_length(btrim(software)) <= 100))));
alter table public.resources add constraint res_subcategory_len CHECK (((subcategory IS NULL) OR ((char_length(btrim(subcategory)) >= 2) AND (char_length(btrim(subcategory)) <= 50))));
alter table public.resources add constraint res_summary_len CHECK (((summary IS NULL) OR ((char_length(btrim(summary)) >= 20) AND (char_length(btrim(summary)) <= 250))));
alter table public.resources add constraint res_tags_n CHECK ((cardinality(tags) <= 10));
alter table public.resources add constraint res_type_len CHECK (((resource_type IS NULL) OR ((char_length(btrim(resource_type)) >= 2) AND (char_length(btrim(resource_type)) <= 50))));
alter table public.resources add constraint res_version_len CHECK (((version IS NULL) OR ((char_length(btrim(version)) >= 1) AND (char_length(btrim(version)) <= 30))));
alter table public.resources add constraint res_visibility_vals CHECK ((visibility = ANY (ARRAY['draft'::text, 'published'::text, 'scheduled'::text, 'hidden'::text])));
alter table public.resources add constraint resources_license_check CHECK ((license = ANY (ARRAY['personal'::text, 'commercial'::text, 'cc0'::text, 'cc-by'::text, 'custom'::text])));
alter table public.resources add constraint resources_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.scheduled_sections add constraint scheduled_sections_section_check CHECK ((section = ANY (ARRAY['resources'::text, 'blog'::text, 'marketplace'::text, 'jobs'::text])));
alter table public.seller_tax add constraint seller_tax_country_check CHECK ((country ~ '^[A-Z]{2}$'::text));
alter table public.seller_tax add constraint seller_tax_pan_check CHECK (((pan IS NULL) OR (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'::text)));
alter table public.settlement_windows add constraint settlement_windows_days_check CHECK ((days >= 0));
alter table public.settlement_windows add constraint settlement_windows_scope_check CHECK ((scope = ANY (ARRAY['domestic'::text, 'international'::text, 'any'::text])));
alter table public.subscription_prices add constraint subscription_prices_amount_check CHECK ((amount > 0));
alter table public.subscription_prices add constraint subscription_prices_plan_check CHECK ((plan = ANY (ARRAY['lite'::text, 'premium'::text, 'max'::text])));
alter table public.support_limits add constraint support_limits_max_amount_check CHECK ((max_amount > 0));
alter table public.support_limits add constraint support_limits_min_amount_check CHECK ((min_amount > 0));
alter table public.tax_remittances add constraint tax_remittances_kind_check CHECK ((kind = ANY (ARRAY['gst_tcs'::text, 'tds_194o'::text])));
alter table public.user_bans add constraint user_bans_note_len CHECK (((note IS NULL) OR (char_length(note) <= 500)));
alter table public.user_bans add constraint user_bans_reason_len CHECK (((char_length(reason) >= 2) AND (char_length(reason) <= 60)));
alter table public.user_reports add constraint user_reports_details_len CHECK (((details IS NULL) OR (char_length(details) <= 1000)));
alter table public.user_reports add constraint user_reports_not_self CHECK (((reporter_id IS NULL) OR (reporter_id <> target_id)));
alter table public.user_reports add constraint user_reports_reason CHECK ((reason = ANY (ARRAY['dmca'::text, 'spam'::text, 'harassment'::text, 'fraud'::text, 'impersonation'::text, 'hate'::text, 'illegal'::text, 'other'::text])));
alter table public.user_reports add constraint user_reports_status CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])));
alter table public.user_tag_prefs add constraint user_tag_prefs_len CHECK (((char_length(tag) >= 1) AND (char_length(tag) <= 15)));
alter table public.user_tag_prefs add constraint user_tag_prefs_norm CHECK ((tag = lower(btrim(tag))));

alter table public.album_items add constraint album_items_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;
alter table public.album_items add constraint album_items_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.albums add constraint albums_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.analytics_events add constraint analytics_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.analytics_events add constraint analytics_events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.analytics_goals add constraint analytics_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.artwork_bookmarks add constraint artwork_bookmarks_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.artwork_bookmarks add constraint artwork_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.artwork_download_dedup add constraint artwork_download_dedup_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.artwork_file add constraint artwork_file_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.artwork_file add constraint artwork_file_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.artwork_image add constraint artwork_image_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.artwork_image add constraint artwork_image_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.artwork_likes add constraint artwork_likes_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.artwork_likes add constraint artwork_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.artwork_reports add constraint artwork_reports_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.artwork_reports add constraint artwork_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.artwork_view_dedup add constraint artwork_view_dedup_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.artworks add constraint artworks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.audit_log add constraint audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.blog_image add constraint blog_image_post_id_fkey FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE;
alter table public.blog_image add constraint blog_image_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.blog_posts add constraint blog_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.cart_items add constraint cart_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE;
alter table public.cart_items add constraint cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.comics add constraint comics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.comments add constraint comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.communities add constraint communities_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.community_members add constraint community_members_community_id_fkey FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE;
alter table public.community_members add constraint community_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.content_repeats add constraint content_repeats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.direct_messages add constraint direct_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.direct_messages add constraint direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.dz_abuse_events add constraint dz_abuse_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.friendships add constraint friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.friendships add constraint friendships_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.friendships add constraint friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hidden_artworks add constraint hidden_artworks_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;
alter table public.hidden_artworks add constraint hidden_artworks_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.item_bookmarks add constraint item_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.item_likes add constraint item_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.jobs add constraint jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.ledger_entries add constraint ledger_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.marketplace_earnings add constraint marketplace_earnings_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.marketplace_earnings add constraint marketplace_earnings_item_id_fkey FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE;
alter table public.marketplace_earnings add constraint marketplace_earnings_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;
alter table public.marketplace_earnings add constraint marketplace_earnings_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL;
alter table public.marketplace_earnings add constraint marketplace_earnings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.marketplace_file add constraint marketplace_file_item_id_fkey FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE;
alter table public.marketplace_file add constraint marketplace_file_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.marketplace_image add constraint marketplace_image_item_id_fkey FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE;
alter table public.marketplace_image add constraint marketplace_image_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.marketplace_items add constraint marketplace_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notification_reads add constraint notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
alter table public.notification_reads add constraint notification_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.partner_commissions add constraint partner_commissions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.partner_commissions add constraint partner_commissions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.partner_commissions add constraint partner_commissions_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE CASCADE;
alter table public.payments add constraint payments_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL;
alter table public.payout_methods add constraint payout_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.payout_requests add constraint payout_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profile_banner_image add constraint profile_banner_image_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profile_creds add constraint profile_creds_giver_id_fkey FOREIGN KEY (giver_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profile_creds add constraint profile_creds_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profile_image add constraint profile_image_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.promo_codes add constraint promo_codes_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reconciliation_flags add constraint reconciliation_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.resources add constraint resources_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.resources_file add constraint resources_file_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE;
alter table public.resources_file add constraint resources_file_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.resources_image add constraint resources_image_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE;
alter table public.resources_image add constraint resources_image_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.scheduled_sections add constraint scheduled_sections_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.scheduled_uploads add constraint scheduled_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.seller_tax add constraint seller_tax_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.upload_events add constraint upload_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_bans add constraint user_bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.user_bans add constraint user_bans_lifted_by_fkey FOREIGN KEY (lifted_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.user_bans add constraint user_bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.user_reports add constraint user_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.user_reports add constraint user_reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.user_reports add constraint user_reports_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.user_tag_prefs add constraint user_tag_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS album_items_artwork_idx ON public.album_items USING btree (artwork_id);
CREATE INDEX IF NOT EXISTS albums_user_created_idx ON public.albums USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_owner_day_idx ON public.analytics_events USING btree (owner_id, day DESC);
CREATE INDEX IF NOT EXISTS analytics_events_owner_event_idx ON public.analytics_events USING btree (owner_id, event, day DESC);
CREATE INDEX IF NOT EXISTS analytics_events_subject_idx ON public.analytics_events USING btree (subject_id, event) WHERE (subject_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS analytics_events_term_idx ON public.analytics_events USING btree (owner_id, term, day DESC) WHERE (term IS NOT NULL);
CREATE INDEX IF NOT EXISTS analytics_goals_user_idx ON public.analytics_goals USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS artwork_file_artwork_id_idx ON public.artwork_file USING btree (artwork_id);
CREATE INDEX IF NOT EXISTS artwork_file_user_id_idx ON public.artwork_file USING btree (user_id);
CREATE INDEX IF NOT EXISTS artwork_image_artwork_id_idx ON public.artwork_image USING btree (artwork_id);
CREATE INDEX IF NOT EXISTS artwork_image_user_id_idx ON public.artwork_image USING btree (user_id);
CREATE INDEX IF NOT EXISTS artwork_reports_status_idx ON public.artwork_reports USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS artworks_category_gin ON public.artworks USING gin (category);
CREATE INDEX IF NOT EXISTS artworks_created_at_idx ON public.artworks USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS artworks_feed_idx ON public.artworks USING btree (status, visibility, kind, featured DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS artworks_kind_idx ON public.artworks USING btree (kind);
CREATE INDEX IF NOT EXISTS artworks_like_count_idx ON public.artworks USING btree (like_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS artworks_phash_idx ON public.artworks USING btree (phash);
CREATE INDEX IF NOT EXISTS artworks_tags_gin ON public.artworks USING gin (tags);
CREATE INDEX IF NOT EXISTS artworks_user_id_idx ON public.artworks USING btree (user_id);
CREATE INDEX IF NOT EXISTS artworks_user_idx ON public.artworks USING btree (user_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log USING btree (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON public.audit_log USING btree (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx ON public.auth_attempts USING btree (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_time_idx ON public.auth_attempts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS blog_cat_gin ON public.blog_posts USING gin (category);
CREATE INDEX IF NOT EXISTS blog_feed_idx ON public.blog_posts USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS blog_image_post_id_idx ON public.blog_image USING btree (post_id);
CREATE INDEX IF NOT EXISTS blog_image_user_id_idx ON public.blog_image USING btree (user_id);
CREATE INDEX IF NOT EXISTS blog_owner_idx ON public.blog_posts USING btree (user_id);
CREATE INDEX IF NOT EXISTS blog_tag_gin ON public.blog_posts USING gin (tags);
CREATE INDEX IF NOT EXISTS cart_items_user_idx ON public.cart_items USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_rate_events_lookup ON public.chat_rate_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cm_user_idx ON public.community_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS comics_created_at_idx ON public.comics USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS comics_phash_idx ON public.comics USING btree (phash);
CREATE INDEX IF NOT EXISTS comics_status_idx ON public.comics USING btree (status);
CREATE INDEX IF NOT EXISTS comics_user_id_idx ON public.comics USING btree (user_id);
CREATE INDEX IF NOT EXISTS content_repeats_last_idx ON public.content_repeats USING btree (last_at);
CREATE INDEX IF NOT EXISTS dm_inbox_idx ON public.direct_messages USING btree (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_outbox_idx ON public.direct_messages USING btree (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_thread_idx ON public.direct_messages USING btree (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);
CREATE INDEX IF NOT EXISTS download_events_month_idx ON public.download_events USING btree (viewer_key, created_at);
CREATE INDEX IF NOT EXISTS download_events_viewer_day_idx ON public.download_events USING btree (viewer_key, created_at DESC);
CREATE INDEX IF NOT EXISTS dz_abuse_events_time_idx ON public.dz_abuse_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS dz_abuse_events_user_idx ON public.dz_abuse_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS earnings_seller_idx ON public.marketplace_earnings USING btree (seller_id, status);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships USING btree (addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships USING btree (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_artworks_category ON public.artworks USING gin (category);
CREATE INDEX IF NOT EXISTS idx_artworks_tags ON public.artworks USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_comics_tags ON public.comics USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_comments_channel_created ON public.comments USING btree (channel, created_at);
CREATE INDEX IF NOT EXISTS item_bookmarks_user_idx ON public.item_bookmarks USING btree (user_id, kind);
CREATE INDEX IF NOT EXISTS item_comments_subject_idx ON public.item_comments USING btree (kind, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS item_likes_user_idx ON public.item_likes USING btree (user_id, kind);
CREATE INDEX IF NOT EXISTS item_reports_subject_idx ON public.item_reports USING btree (kind, subject_id);
CREATE INDEX IF NOT EXISTS item_view_dedup_day_idx ON public.item_view_dedup USING btree (kind, day);
CREATE INDEX IF NOT EXISTS item_view_dedup_subject_idx ON public.item_view_dedup USING btree (subject_id, day);
CREATE INDEX IF NOT EXISTS jobs_cat_gin ON public.jobs USING gin (category);
CREATE INDEX IF NOT EXISTS jobs_feed_idx ON public.jobs USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_owner_created_idx ON public.jobs USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_owner_idx ON public.jobs USING btree (user_id);
CREATE INDEX IF NOT EXISTS jobs_tag_gin ON public.jobs USING gin (tags);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON public.ledger_entries USING btree (user_id, currency);
CREATE INDEX IF NOT EXISTS marketplace_cat_gin ON public.marketplace_items USING gin (category);
CREATE INDEX IF NOT EXISTS marketplace_feed_idx ON public.marketplace_items USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_file_item_idx ON public.marketplace_file USING btree (item_id);
CREATE INDEX IF NOT EXISTS marketplace_file_user_idx ON public.marketplace_file USING btree (user_id);
CREATE INDEX IF NOT EXISTS marketplace_image_item_id_idx ON public.marketplace_image USING btree (item_id);
CREATE INDEX IF NOT EXISTS marketplace_image_user_id_idx ON public.marketplace_image USING btree (user_id);
CREATE INDEX IF NOT EXISTS marketplace_owner_idx ON public.marketplace_items USING btree (user_id);
CREATE INDEX IF NOT EXISTS marketplace_tag_gin ON public.marketplace_items USING gin (tags);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS partner_commissions_partner_idx ON public.partner_commissions USING btree (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_commissions_promo_idx ON public.partner_commissions USING btree (promo_code_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_item_paid_idx ON public.payments USING btree (item_id, user_id) WHERE (status = 'paid'::text);
CREATE INDEX IF NOT EXISTS payments_item_user_status_idx ON public.payments USING btree (item_id, user_id, status) WHERE (item_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS payments_user_idx ON public.payments USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payout_methods_user_idx ON public.payout_methods USING btree (user_id);
CREATE INDEX IF NOT EXISTS payout_requests_user_idx ON public.payout_requests USING btree (user_id, status);
CREATE INDEX IF NOT EXISTS rate_hits_window_idx ON public.rate_hits USING btree (window_start);
CREATE INDEX IF NOT EXISTS recon_flags_user_idx ON public.reconciliation_flags USING btree (user_id, status);
CREATE INDEX IF NOT EXISTS resources_cat_gin ON public.resources USING gin (category);
CREATE INDEX IF NOT EXISTS resources_feed_idx ON public.resources USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS resources_file_resource_id_idx ON public.resources_file USING btree (resource_id);
CREATE INDEX IF NOT EXISTS resources_file_user_id_idx ON public.resources_file USING btree (user_id);
CREATE INDEX IF NOT EXISTS resources_image_resource_id_idx ON public.resources_image USING btree (resource_id);
CREATE INDEX IF NOT EXISTS resources_image_user_id_idx ON public.resources_image USING btree (user_id);
CREATE INDEX IF NOT EXISTS resources_owner_idx ON public.resources USING btree (user_id);
CREATE INDEX IF NOT EXISTS resources_tag_gin ON public.resources USING gin (tags);
CREATE INDEX IF NOT EXISTS scheduled_sections_due_idx ON public.scheduled_sections USING btree (publish_at) WHERE (publish_error IS NULL);
CREATE INDEX IF NOT EXISTS scheduled_uploads_due_idx ON public.scheduled_uploads USING btree (publish_at);
CREATE INDEX IF NOT EXISTS scheduled_uploads_user_idx ON public.scheduled_uploads USING btree (user_id, publish_at);
CREATE INDEX IF NOT EXISTS upload_events_user_time ON public.upload_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_bans_recent_idx ON public.user_bans USING btree (banned_at DESC);
CREATE INDEX IF NOT EXISTS user_reports_open_idx ON public.user_reports USING btree (created_at DESC) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS user_reports_target_idx ON public.user_reports USING btree (target_id);
CREATE UNIQUE INDEX albums_user_name_uniq ON public.albums USING btree (user_id, lower(btrim(name)));
CREATE UNIQUE INDEX analytics_events_once_idx ON public.analytics_events USING btree (owner_id, event, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid), viewer_key, COALESCE(term, ''::text), day);
CREATE UNIQUE INDEX analytics_goals_one_idx ON public.analytics_goals USING btree (user_id, scope, metric, period);
CREATE UNIQUE INDEX communities_join_code_idx ON public.communities USING btree (upper(join_code));
CREATE UNIQUE INDEX communities_name_lower_idx ON public.communities USING btree (lower(btrim(name)));
CREATE UNIQUE INDEX friendships_pair_uniq ON public.friendships USING btree (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE UNIQUE INDEX item_reports_once_idx ON public.item_reports USING btree (reporter_id, kind, subject_id, COALESCE(subject_ref, ''::text));
CREATE UNIQUE INDEX partner_commissions_earning_idx ON public.partner_commissions USING btree (earning_id) WHERE (earning_id IS NOT NULL);
CREATE UNIQUE INDEX partner_commissions_payment_idx ON public.partner_commissions USING btree (payment_id) WHERE (payment_id IS NOT NULL);
CREATE UNIQUE INDEX payments_pp_order_id_key ON public.payments USING btree (pp_order_id);
CREATE UNIQUE INDEX payout_methods_one_default ON public.payout_methods USING btree (user_id) WHERE is_default;
CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (lower(username));
CREATE UNIQUE INDEX promo_codes_code_idx ON public.promo_codes USING btree (code);
CREATE UNIQUE INDEX promo_codes_partner_idx ON public.promo_codes USING btree (partner_id);
CREATE UNIQUE INDEX user_bans_live_idx ON public.user_bans USING btree (user_id) WHERE (lifted_at IS NULL);
CREATE UNIQUE INDEX user_reports_one_open_idx ON public.user_reports USING btree (reporter_id, target_id) WHERE (status = 'pending'::text);

create or replace view public.an_bookmark as  SELECT 'artwork'::text AS kind, b.artwork_id AS subject_id, b.user_id, b.created_at FROM artwork_bookmarks b UNION ALL SELECT k.kind, k.subject_id, k.user_id, k.created_at FROM item_bookmarks k;
create or replace view public.an_download as  SELECT 'artwork'::text AS kind, d.artwork_id AS subject_id, d.viewer_key, d.day FROM artwork_download_dedup d UNION ALL SELECT CASE WHEN (e.kind = 'resources'::text) THEN 'resource'::text ELSE e.kind END AS kind, e.subject_id, e.viewer_key, (e.created_at)::date AS day FROM download_events e WHERE ((e.kind <> 'artwork'::text) AND (e.subject_id IS NOT NULL)) GROUP BY CASE WHEN (e.kind = 'resources'::text) THEN 'resource'::text ELSE e.kind END, e.subject_id, e.viewer_key, ((e.created_at)::date);
create or replace view public.an_item as  SELECT 'artwork'::text AS kind, a.id, a.user_id, COALESCE(NULLIF(btrim(a.name), ''::text), 'Untitled'::text) AS title, a.image_url AS thumb, a.category, a.tags, CASE WHEN (COALESCE(array_length(a.software_list, 1), 0) > 0) THEN a.software_list WHEN ((a.software IS NOT NULL) AND (btrim(a.software) <> ''::text)) THEN ARRAY[a.software] ELSE '{}'::text[] END AS software, (a.created_at)::timestamp with time zone AS created_at, a.status, a.visibility, a.featured, a.license, a.is_mature, COALESCE(a.view_count, (0)::bigint) AS view_count, COALESCE(a.like_count, (0)::bigint) AS like_count, COALESCE(a.bookmark_count, (0)::bigint) AS bookmark_count, (COALESCE(a.download_count, 0))::bigint AS download_count, (0)::bigint AS sales_count, (0)::bigint AS price_cents FROM artworks a UNION ALL SELECT 'marketplace'::text AS kind, m.id, m.user_id, COALESCE(NULLIF(btrim(m.title), ''::text), 'Untitled'::text) AS title, m.preview_url AS thumb, m.category, m.tags, CASE WHEN ((m.software IS NOT NULL) AND (btrim(m.software) <> ''::text)) THEN ARRAY[m.software] ELSE '{}'::text[] END AS software, m.created_at, m.status, m.visibility, m.featured, m.license, false AS is_mature, COALESCE(m.view_count, (0)::bigint) AS view_count, COALESCE(m.like_count, (0)::bigint) AS like_count, (0)::bigint AS bookmark_count, (0)::bigint AS download_count, (COALESCE(m.sales_count, 0))::bigint AS sales_count, (COALESCE(m.price_cents, 0))::bigint AS price_cents FROM marketplace_items m UNION ALL SELECT 'blog'::text AS kind, b.id, b.user_id, COALESCE(NULLIF(btrim(b.title), ''::text), 'Untitled'::text) AS title, b.cover_url AS thumb, b.category, b.tags, '{}'::text[] AS software, b.created_at, b.status, b.visibility, b.featured, NULL::text AS license, false AS is_mature, COALESCE(b.view_count, (0)::bigint) AS view_count, COALESCE(b.like_count, (0)::bigint) AS like_count, COALESCE(b.bookmark_count, (0)::bigint) AS bookmark_count, (0)::bigint AS download_count, (0)::bigint AS sales_count, (0)::bigint AS price_cents FROM blog_posts b UNION ALL SELECT 'resource'::text AS kind, r.id, r.user_id, COALESCE(NULLIF(btrim(r.title), ''::text), 'Untitled'::text) AS title, r.preview_url AS thumb, r.category, r.tags, CASE WHEN (COALESCE(array_length(r.compatible_software, 1), 0) > 0) THEN r.compatible_software WHEN ((r.software IS NOT NULL) AND (btrim(r.software) <> ''::text)) THEN ARRAY[r.software] ELSE '{}'::text[] END AS software, r.created_at, r.status, r.visibility, r.featured, r.license, false AS is_mature, COALESCE(r.view_count, (0)::bigint) AS view_count, COALESCE(r.like_count, (0)::bigint) AS like_count, (0)::bigint AS bookmark_count, (COALESCE(r.download_count, 0))::bigint AS download_count, (0)::bigint AS sales_count, (0)::bigint AS price_cents FROM resources r;
create or replace view public.an_like as  SELECT 'artwork'::text AS kind, l.artwork_id AS subject_id, l.user_id, l.created_at FROM artwork_likes l UNION ALL SELECT k.kind, k.subject_id, k.user_id, k.created_at FROM item_likes k;
create or replace view public.an_view as  SELECT 'artwork'::text AS kind, d.artwork_id AS subject_id, d.viewer_key, d.day FROM artwork_view_dedup d UNION ALL SELECT v.kind, v.subject_id, v.viewer_key, v.day FROM item_view_dedup v;
create or replace view public.wallet_history with (security_invoker=true) as  SELECT p.id, p.user_id, 'purchase'::text AS direction, p.kind AS category, COALESCE(p.order_label, CASE WHEN (p.kind = 'subscription'::text) THEN COALESCE(initcap(p.plan), 'Subscription'::text) ELSE 'Marketplace item'::text END) AS title, p.amount, p.currency, p.status, p.provider, p.transaction_id, COALESCE(p.paid_at, p.created_at) AS happened_at FROM payments p UNION ALL SELECT e.id, e.seller_id AS user_id, 'sale'::text AS direction, 'marketplace'::text AS category, COALESCE(m.title, 'Marketplace item'::text) AS title, e.net_amount AS amount, e.currency, e.status, NULL::text AS provider, NULL::text AS transaction_id, e.created_at AS happened_at FROM (marketplace_earnings e LEFT JOIN marketplace_items m ON ((m.id = e.item_id))) UNION ALL SELECT r.id, r.user_id, 'payout'::text AS direction, 'payout'::text AS category, 'Withdrawal'::text AS title, r.amount, r.currency, r.status, r.method AS provider, r.batch_id AS transaction_id, COALESCE(r.paid_at, r.decided_at, r.requested_at) AS happened_at FROM payout_requests r;

CREATE OR REPLACE FUNCTION public.albums_cap_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_cap int;
begin
  v_cap := case when coalesce(public.dz_effective_tier(new.user_id),'guest') in ('premium','max')
                then 30 else 25 end;
  if (select count(*) from public.albums where user_id = new.user_id) >= v_cap then
    raise exception 'Album limit reached (%)', v_cap;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.apply_merit_penalty() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  owner_id uuid;
begin
  if OLD.status = 'open' and NEW.status = 'resolved' then
    select user_id into owner_id from public.artworks where id = NEW.artwork_id;
    if owner_id is not null then
      perform set_config('app.allow_merit_write', '1', true);
      update public.profiles
         set merit = greatest(coalesce(merit,100) - 2, 0),
             merit_updated_at = now()
       where id = owner_id;
      perform set_config('app.allow_merit_write', '0', true);
    end if;
  end if;
  return NEW;
end; $function$;

CREATE OR REPLACE FUNCTION public.arr_items_within(a text[], lo integer, hi integer) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'pg_catalog', 'pg_temp' AS $function$
  select coalesce(
    (select bool_and(char_length(btrim(x)) between lo and hi)
       from unnest(coalesce(a, '{}'::text[])) x),
    true)
$function$;

CREATE OR REPLACE FUNCTION public.can_post_community(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists (
    select 1 from public.community_members m
     where m.community_id = cid
       and m.user_id = auth.uid()
       and m.banned = false
       and (m.timeout_until is null or m.timeout_until <= now())
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_read_community(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists (
    select 1 from public.communities c
     where c.id = cid and c.is_public
  ) or exists (
    select 1 from public.community_members m
     where m.community_id = cid
       and m.user_id = auth.uid()
       and m.banned = false
  )
$function$;

CREATE OR REPLACE FUNCTION public.cm_assert_can_act(cid uuid, target uuid, need integer) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  actor_rank  int := public.my_community_rank(cid);
  target_role text;
  target_rank int;
begin
  if target = auth.uid() then
    raise exception 'CM_SELF' using errcode='P0001';
  end if;
  if actor_rank < need then
    raise exception 'CM_FORBIDDEN' using errcode='P0001';
  end if;
  select role into target_role from public.community_members
   where community_id = cid and user_id = target;
  if target_role is null then
    raise exception 'CM_NOT_MEMBER' using errcode='P0001';
  end if;
  target_rank := public.community_rank(target_role);
  if target_rank >= actor_rank then
    raise exception 'CM_RANK' using errcode='P0001';
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.cm_browse(p_q text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, name text, short_description text, description text, avatar_url text, is_public boolean, members bigint, joined boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select c.id,
         c.name,
         c.short_description,
         c.description,
         c.avatar_url,
         c.is_public,
         count(m.user_id) filter (where m.banned = false) as members,
         bool_or(m.user_id = auth.uid() and m.banned = false) as joined
    from public.communities c
    left join public.community_members m on m.community_id = c.id
   where c.is_public
     and public.cm_state(c.id) <> 'locked'
     and (p_q is null
       or btrim(p_q) = ''
       or c.name ilike '%' || replace(replace(btrim(p_q), '%', '\%'), '_', '\_') || '%'
       or coalesce(c.short_description, '') ilike '%' || replace(replace(btrim(p_q), '%', '\%'), '_', '\_') || '%')
   group by c.id
   order by count(m.user_id) filter (where m.banned = false) desc, c.name asc, c.id asc
   limit greatest(1, least(coalesce(p_limit, 30), 50))
  offset greatest(0, coalesce(p_offset, 0))
$function$;

CREATE OR REPLACE FUNCTION public.cm_create(p_name text, p_desc text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  new_id uuid;
  code   text;
  lvl    int  := public.current_artist_level();
  is_max boolean := public.dz_effective_tier(auth.uid()) = 'max';
  has_earned boolean;
  has_plan   boolean;
  v_plan_backed boolean;
begin
  if auth.uid() is null then
    raise exception 'CM_FORBIDDEN' using errcode='P0001';
  end if;

  select exists (select 1 from public.communities
                  where owner_id = auth.uid() and not plan_backed),
         exists (select 1 from public.communities
                  where owner_id = auth.uid() and plan_backed)
    into has_earned, has_plan;

  if public.is_dev() then
    v_plan_backed := false;
  elsif lvl >= 100 and not has_earned then
    v_plan_backed := false;
  elsif is_max and not has_plan then
    v_plan_backed := true;
  elsif lvl < 100 and not is_max then
    raise exception 'CM_LEVEL' using errcode='P0001';
  else
    raise exception 'CM_ALREADY_OWNER' using errcode='P0001';
  end if;

  if exists (select 1 from public.communities
              where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'CM_NAME_TAKEN' using errcode='P0001';
  end if;

  loop
    code := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 6));
    exit when not exists (select 1 from public.communities c where upper(c.join_code) = code);
  end loop;

  insert into public.communities (name, join_code, description, owner_id, plan_backed)
  values (btrim(p_name), code, nullif(btrim(coalesce(p_desc,'')),''), auth.uid(), v_plan_backed)
  returning id into new_id;

  insert into public.community_members (community_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.cm_delete(cid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if not exists (select 1 from public.communities where id = cid and owner_id = auth.uid()) then
    raise exception 'CM_FORBIDDEN' using errcode = 'P0001';
  end if;
  delete from public.comments where channel = 'c:' || cid::text;
  delete from public.community_members where community_id = cid;
  delete from public.communities where id = cid;
end $function$;

CREATE OR REPLACE FUNCTION public.cm_grace_days() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$ select 3 $function$;

CREATE OR REPLACE FUNCTION public.cm_grace_until(cid uuid) RETURNS timestamp with time zone LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select case when public.cm_state(cid) = 'grace'
    then p.subscription_expires_at + (public.cm_grace_days() || ' days')::interval
  end
  from public.communities c
  join public.profiles p on p.id = c.owner_id
  where c.id = cid;
$function$;

CREATE OR REPLACE FUNCTION public.cm_join(p_name text, p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare cid uuid;
begin
  select id into cid from public.communities
   where lower(btrim(name)) = lower(btrim(p_name))
     and upper(join_code)   = upper(btrim(p_code));
  if cid is null then
    raise exception 'CM_NOT_FOUND' using errcode='P0001';
  end if;
  if public.cm_state(cid) = 'locked' then
    raise exception 'CM_LOCKED' using errcode='P0001';
  end if;
  if exists (select 1 from public.community_members
              where community_id = cid and user_id = auth.uid() and banned) then
    raise exception 'CM_BANNED' using errcode='P0001';
  end if;
  insert into public.community_members (community_id, user_id, role)
  values (cid, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;
  return cid;
end; $function$;

CREATE OR REPLACE FUNCTION public.cm_join_public(cid uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if auth.uid() is null then
    raise exception 'CM_FORBIDDEN' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.communities c where c.id = cid and c.is_public) then
    raise exception 'CM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if public.cm_state(cid) = 'locked' then
    raise exception 'CM_LOCKED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.community_members
              where community_id = cid and user_id = auth.uid() and banned) then
    raise exception 'CM_BANNED' using errcode = 'P0001';
  end if;
  insert into public.community_members (community_id, user_id, role)
  values (cid, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;
  return cid;
end $function$;

CREATE OR REPLACE FUNCTION public.cm_kick(cid uuid, target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform public.cm_assert_can_act(cid, target, 2);
  delete from public.community_members
   where community_id = cid and user_id = target;
end; $function$;

CREATE OR REPLACE FUNCTION public.cm_leave(cid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if auth.uid() is null then
    raise exception 'CM_FORBIDDEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.communities where id = cid and owner_id = auth.uid()) then
    raise exception 'CM_OWNER_LEAVE' using errcode = 'P0001';
  end if;
  delete from public.community_members
   where community_id = cid and user_id = auth.uid();
end $function$;

CREATE OR REPLACE FUNCTION public.cm_member_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_max int := 50;
  v_n   int;
begin
  if exists (select 1 from public.community_members
              where community_id = new.community_id and user_id = new.user_id) then
    return new;
  end if;

  select count(*) into v_n
    from public.community_members
   where user_id = new.user_id and not banned;

  if v_n >= v_max then
    raise exception 'CM_MAX_JOINED' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.cm_set_ban(cid uuid, target uuid, do_ban boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform public.cm_assert_can_act(cid, target, 3);
  update public.community_members
     set banned = do_ban,
         role   = case when do_ban then 'member' else role end,
         timeout_until = case when do_ban then null else timeout_until end
   where community_id = cid and user_id = target;
end; $function$;

CREATE OR REPLACE FUNCTION public.cm_set_role(cid uuid, target uuid, new_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare actor_rank int := public.my_community_rank(cid);
begin
  if new_role not in ('member','jr_mod','sr_mod','admin') then
    raise exception 'CM_BAD_ROLE' using errcode='P0001';
  end if;
  perform public.cm_assert_can_act(cid, target, 4);
  if public.community_rank(new_role) >= actor_rank then
    raise exception 'CM_RANK' using errcode='P0001';
  end if;
  update public.community_members
     set role = new_role
   where community_id = cid and user_id = target;
end; $function$;

CREATE OR REPLACE FUNCTION public.cm_state(cid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select case
    when c.id is null                     then 'locked'
    when not c.plan_backed                then 'live'
    when public.dz_effective_tier(c.owner_id) = 'max' then 'live'
    when p.subscription_expires_at is null then 'locked'
    when p.subscription_expires_at
         + (public.cm_grace_days() || ' days')::interval > now() then 'grace'
    else 'locked'
  end
  from (select cid as id) q
  left join public.communities c on c.id = q.id
  left join public.profiles    p on p.id = c.owner_id;
$function$;

CREATE OR REPLACE FUNCTION public.cm_timeout(cid uuid, target uuid, minutes integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if minutes not in (0,5,60,1440,10080,43200) then
    raise exception 'CM_BAD_DURATION' using errcode='P0001';
  end if;
  perform public.cm_assert_can_act(cid, target, 2);
  update public.community_members
     set timeout_until = case when minutes = 0 then null
                              else now() + (minutes || ' minutes')::interval end
   where community_id = cid and user_id = target;
end; $function$;

CREATE OR REPLACE FUNCTION public.community_channel_id(ch text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  select case
    when ch ~ '^c:[0-9a-fA-F-]{36}$'
    then substring(ch from 3)::uuid
    else null
  end
$function$;

CREATE OR REPLACE FUNCTION public.community_rank(r text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$ select case r
        when 'owner'  then 5 when 'admin' then 4
        when 'sr_mod' then 3 when 'jr_mod' then 2
        else 1 end $function$;

CREATE OR REPLACE FUNCTION public.current_artist_level() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select coalesce((select level from public.get_artist_progress(auth.uid())), 1)
$function$;

CREATE OR REPLACE FUNCTION public.current_merit() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$ select coalesce((select merit from public.profiles where id = auth.uid()), 100) $function$;

CREATE OR REPLACE FUNCTION public.dz_abuse_recent(p_hours integer DEFAULT 24, p_limit integer DEFAULT 200) RETURNS SETOF dz_abuse_events LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if to_regprocedure('public.dz_is_staff()') is not null then
    if not public.dz_is_staff() then raise exception 'staff only' using errcode='42501'; end if;
  elsif to_regprocedure('public.is_dev()') is not null then
    if not public.is_dev() then raise exception 'staff only' using errcode='42501'; end if;
  else
    raise exception 'staff only' using errcode='42501';
  end if;
  return query
    select * from public.dz_abuse_events
     where created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_hours,24),720)))
     order by created_at desc
     limit greatest(1, least(coalesce(p_limit,200),1000));
end $function$;

CREATE OR REPLACE FUNCTION public.dz_actor_key() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_uid uuid := auth.uid(); v_role text; v_hdr text; v_ip text;
begin
  if v_uid is not null then return 'u:' || v_uid::text; end if;
  begin
    v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role'));
  exception when others then v_role := null; end;
  if v_role = 'service_role' then return null; end if;
  v_hdr := nullif(current_setting('request.headers', true), '');
  if v_hdr is null then return null; end if;
  if to_regprocedure('public.dz_client_ip()') is not null then
    begin v_ip := public.dz_client_ip(); exception when others then v_ip := null; end;
  end if;
  return case when v_ip is not null and v_ip <> '' then 'ip:' || v_ip else 'anon' end;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_add_business_days(p_from timestamp with time zone, p_days integer) RETURNS timestamp with time zone LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
declare v_at timestamptz := p_from; v_left integer := greatest(p_days, 0);
begin
  while v_left > 0 loop
    v_at := v_at + interval '1 day';
    if extract(isodow from v_at) < 6 then v_left := v_left - 1; end if;
  end loop;
  return v_at;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_admin_partners() RETURNS TABLE(partner_id uuid, username text, display_name text, partner_since timestamp with time zone, max_claimed boolean, code text, code_active boolean, usage_count integer, conversions bigint, earned_json jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_is_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  select p.id, p.username, p.display_name, p.partner_since, p.max_claimed,
         c.code, c.is_active, c.usage_count,
         coalesce(x.n, 0)::bigint,
         coalesce(x.earned, '{}'::jsonb)
    from public.profiles p
    left join public.promo_codes c on c.partner_id = p.id
    left join lateral (
      select count(*) as n,
             jsonb_object_agg(t.currency, t.amt) as earned
        from (select pc.currency, sum(pc.amount)::bigint as amt
                from public.partner_commissions pc
               where pc.partner_id = p.id and pc.payout_status <> 'reversed'
               group by pc.currency) t
    ) x on true
   where p.role = 'partner'
   order by p.partner_since desc nulls last, p.username;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_admin_telemetry() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_sub     jsonb;
  v_content jsonb;
  v_dev     jsonb;
  v_eng     jsonb;
  v_mod     jsonb;
begin
  if not public.dz_is_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
           'lite',    count(*) filter (where tier = 'lite'),
           'premium', count(*) filter (where tier = 'premium'),
           'max',     count(*) filter (where tier = 'max'),
           'free',    count(*) filter (where tier not in ('lite', 'premium', 'max')),
           'partners', count(*) filter (where role = 'partner'),
           'total',   count(*))
    into v_sub
    from (
      select p.role,
             case when p.subscription_expires_at is null
                   or p.subscription_expires_at <= now()
                  then 'guest' else coalesce(p.subscription_tier, 'guest') end as tier
        from public.profiles p) t;

  select jsonb_build_object(
           'artworks',    (select count(*) from public.artworks),
           'resources',   (select count(*) from public.resources),
           'marketplace', (select count(*) from public.marketplace_items),
           'blogs',       (select count(*) from public.blog_posts),
           'jobs',        (select count(*) from public.jobs),
           'communities', (select count(*) from public.communities),
           'today', jsonb_build_object(
             'artworks',    (select count(*) from public.artworks         where created_at >= current_date),
             'resources',   (select count(*) from public.resources        where created_at >= current_date),
             'marketplace', (select count(*) from public.marketplace_items where created_at >= current_date),
             'blogs',       (select count(*) from public.blog_posts       where created_at >= current_date),
             'jobs',        (select count(*) from public.jobs             where created_at >= current_date)))
    into v_content;

  select coalesce(jsonb_object_agg(device, n), '{}'::jsonb)
    into v_dev
    from (select device, count(distinct viewer_key)::bigint as n
            from public.analytics_events
           where created_at >= now() - interval '24 hours'
           group by device) d;

  select jsonb_build_object(
           'dau', (select count(distinct viewer_key) from public.analytics_events
                    where created_at >= now() - interval '24 hours'),
           'mau', (select count(distinct viewer_key) from public.analytics_events
                    where created_at >= now() - interval '30 days'),
           'dau_signed_in', (select count(distinct actor_id) from public.analytics_events
                              where actor_id is not null
                                and created_at >= now() - interval '24 hours'),
           'events_24h', (select count(*) from public.analytics_events
                           where created_at >= now() - interval '24 hours'),
           'new_members_24h', (select count(*) from public.profiles
                                where created_at >= now() - interval '24 hours'))
    into v_eng;

  select jsonb_build_object(
           'open_user_reports', (select count(*) from public.user_reports where status = 'pending'),
           'open_item_reports', (select count(*) from public.artwork_reports where status = 'open'),
           'active_bans', (select count(*) from public.user_bans
                            where lifted_at is null
                              and (expires_at is null or expires_at > now())))
    into v_mod;

  return jsonb_build_object(
    'at', now(), 'subscriptions', v_sub, 'content', v_content,
    'devices', v_dev, 'engagement', v_eng, 'moderation', v_mod);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_an_achievements(p_user uuid, p_scope text DEFAULT 'artwork'::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_sc text := public.dz_an_scope(p_scope);
  v_up bigint; v_vw bigint; v_lk bigint; v_dl bigint; v_cm bigint;
  v_out jsonb;
  v_noun text := case v_sc when 'marketplace' then 'listings'
                           when 'blog' then 'posts'
                           when 'resource' then 'resources'
                           else 'artworks' end;
begin
  select count(*) into v_up from public.an_item i where i.user_id = p_user and i.kind = v_sc;

  select count(*) into v_vw from public.an_view d
    join public.an_item i on i.id = d.subject_id and i.kind = d.kind
   where i.user_id = p_user and d.kind = v_sc;

  select count(*) into v_lk from public.an_like l
    join public.an_item i on i.id = l.subject_id and i.kind = l.kind
   where i.user_id = p_user and l.kind = v_sc;

  select count(*) into v_dl from public.an_download d
    join public.an_item i on i.id = d.subject_id and i.kind = d.kind
   where i.user_id = p_user and d.kind = v_sc;

  select count(*) into v_cm from public.item_comments c
    join public.an_item i on i.id = c.subject_id and i.kind = c.kind
   where i.user_id = p_user and c.kind = v_sc and c.user_id <> p_user;

  select jsonb_agg(jsonb_build_object(
           'key', k, 'title', title, 'note', note,
           'have', have, 'need', need, 'done', have >= need) order by ord)
    into v_out
    from (values
      (1,  'first_upload', 'First Light',      'Publish your first '||rtrim(v_noun,'s'), v_up, 1::bigint),
      (2,  'five_uploads', 'Getting Going',    'Publish five '||v_noun,                  v_up, 5::bigint),
      (3,  'twenty_five',  'A Real Body',      'Publish twenty-five '||v_noun,           v_up, 25::bigint),
      (4,  'views_100',    'Seen',             'Reach 100 views here',                   v_vw, 100::bigint),
      (5,  'views_1k',     'Noticed',          'Reach 1,000 views here',                 v_vw, 1000::bigint),
      (6,  'views_10k',    'Widely Seen',      'Reach 10,000 views here',                v_vw, 10000::bigint),
      (7,  'likes_10',     'Liked',            'Collect 10 likes here',                  v_lk, 10::bigint),
      (8,  'likes_100',    'Loved',            'Collect 100 likes here',                 v_lk, 100::bigint),
      (9,  'likes_1k',     'Adored',           'Collect 1,000 likes here',               v_lk, 1000::bigint),
      (10, 'dl_1',         'Taken Home',       'Be downloaded once',                     v_dl, 1::bigint),
      (11, 'dl_50',        'In Demand',        'Reach 50 downloads',                     v_dl, 50::bigint),
      (12, 'comments_25',  'Talked About',     'Receive 25 comments here',               v_cm, 25::bigint)
    ) as t(ord, k, title, note, have, need);

  return coalesce(v_out, '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_an_country(p_hint text DEFAULT NULL::text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_raw text;
  v_hdr json;
  v_cc  text;
begin
  v_raw := nullif(current_setting('request.headers', true), '');
  if v_raw is not null then
    begin
      v_hdr := v_raw::json;
      v_cc := upper(btrim(coalesce(
        nullif(v_hdr ->> 'cf-ipcountry', ''),
        nullif(v_hdr ->> 'x-vercel-ip-country', ''),
        nullif(v_hdr ->> 'x-country-code', ''),
        ''
      )));
    exception when others then
      v_cc := null;
    end;
  end if;
  if v_cc is not null and v_cc ~ '^[A-Z]{2}$' and v_cc not in ('XX', 'T1') then
    return v_cc;
  end if;
  v_cc := upper(btrim(coalesce(p_hint, '')));
  if v_cc ~ '^[A-Z]{2}$' then return v_cc; end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_an_days(p_days integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
  select case when p_days in (7, 14, 30, 90, 365) then p_days else 30 end;
$function$;

CREATE OR REPLACE FUNCTION public.dz_an_goal_progress(p_user uuid, p_metric text, p_period text, p_scope text DEFAULT 'artwork'::text) RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_sc   text := public.dz_an_scope(p_scope);
  v_from date := case p_period
                   when '7d'  then current_date - 6
                   when '30d' then current_date - 29
                   when '90d' then current_date - 89
                   else date '1970-01-01'
                 end;
begin
  return case p_metric
    when 'views' then
      (select count(*) from public.an_view d
         join public.an_item i on i.id = d.subject_id and i.kind = d.kind
        where i.user_id = p_user and d.kind = v_sc and d.day >= v_from)
    when 'likes' then
      (select count(*) from public.an_like l
         join public.an_item i on i.id = l.subject_id and i.kind = l.kind
        where i.user_id = p_user and l.kind = v_sc and l.created_at::date >= v_from)
    when 'bookmarks' then
      (select count(*) from public.an_bookmark b
         join public.an_item i on i.id = b.subject_id and i.kind = b.kind
        where i.user_id = p_user and b.kind = v_sc and b.created_at::date >= v_from)
    when 'downloads' then
      (select count(*) from public.an_download d
         join public.an_item i on i.id = d.subject_id and i.kind = d.kind
        where i.user_id = p_user and d.kind = v_sc and d.day >= v_from)
    when 'comments' then
      (select count(*) from public.item_comments c
         join public.an_item i on i.id = c.subject_id and i.kind = c.kind
        where i.user_id = p_user and c.kind = v_sc and c.user_id <> p_user
          and c.created_at::date >= v_from)
    when 'uploads' then
      (select count(*) from public.an_item i
        where i.user_id = p_user and i.kind = v_sc and i.created_at::date >= v_from)
    when 'sales' then
      (select count(*) from public.marketplace_earnings e
        where v_sc = 'marketplace' and e.seller_id = p_user
          and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
          and e.created_at::date >= v_from)
    else 0
  end;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_an_scope(p_scope text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
  select case lower(coalesce(p_scope, 'artwork'))
           when 'marketplace' then 'marketplace'
           when 'blog'        then 'blog'
           when 'resource'    then 'resource'
           when 'resources'   then 'resource'
           else 'artwork'
         end;
$function$;

CREATE OR REPLACE FUNCTION public.dz_an_viewer_key(p_anon_key text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_ip text;
begin
  if auth.uid() is not null then
    return 'u:' || auth.uid()::text;
  end if;
  v_ip := public.dz_client_ip();
  if v_ip is not null then
    return 'a:' || md5('dzview|' || v_ip);
  end if;
  if p_anon_key is null
     or length(p_anon_key) not between 16 and 64
     or p_anon_key !~ '^[A-Za-z0-9-]+$' then
    return null;
  end if;
  return 'a:' || p_anon_key;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_analytics_activity(p_days integer DEFAULT 30, p_scope text DEFAULT 'artwork'::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_me   uuid := auth.uid();
  v_days int  := public.dz_an_days(p_days);
  v_sc   text := public.dz_an_scope(p_scope);
  v_to   date := current_date;
  v_from date := current_date - (v_days - 1);
  v_out  jsonb;
begin
  if v_me is null then return jsonb_build_object('error', 'auth'); end if;

  update public.analytics_goals g
     set achieved_at = now()
   where g.user_id = v_me
     and g.scope = v_sc
     and g.achieved_at is null
     and public.dz_an_goal_progress(v_me, g.metric, g.period, g.scope) >= g.target;

  with mine as (select i.id, i.title from public.an_item i
                 where i.user_id = v_me and i.kind = v_sc),
  eng as (
    select
      (select count(*) from public.an_view d join mine m on m.id = d.subject_id
        where d.kind = v_sc and d.day between v_from and v_to)::bigint as views,
      (select count(*) from public.an_like l join mine m on m.id = l.subject_id
        where l.kind = v_sc and l.created_at::date between v_from and v_to)::bigint as likes,
      (select count(*) from public.an_bookmark b join mine m on m.id = b.subject_id
        where b.kind = v_sc and b.created_at::date between v_from and v_to)::bigint as bookmarks,
      (select count(*) from public.item_comments c join mine m on m.id = c.subject_id
        where c.kind = v_sc and c.user_id <> v_me
          and c.created_at::date between v_from and v_to)::bigint as comments,
      (select count(*) from public.an_download d join mine m on m.id = d.subject_id
        where d.kind = v_sc and d.day between v_from and v_to)::bigint as downloads,
      (select count(*) from public.analytics_events e
        where e.owner_id = v_me and e.event = 'share' and e.scope = v_sc
          and e.day between v_from and v_to)::bigint as shares
  ),
  cseries as (
    select jsonb_agg(jsonb_build_object('d', cal.day, 'gained', coalesce(g.n, 0)) order by cal.day) as list
      from (select gs::date as day from generate_series(v_from, v_to, interval '1 day') gs) cal
      left join (
        select c.created_at::date as day, count(*)::bigint as n
          from public.profile_creds c
         where c.receiver_id = v_me and c.created_at::date between v_from and v_to
         group by 1
      ) g on g.day = cal.day
  ),
  recent_cred as (
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', coalesce(nullif(p.display_name, ''), p.username, 'Artist'),
             'handle', p.username, 'avatar', p.avatar_url, 'at', c.at) order by c.at desc) as list
      from (
        select c.giver_id as other, c.created_at as at
          from public.profile_creds c where c.receiver_id = v_me
         order by c.created_at desc limit 8
      ) c join public.profiles p on p.id = c.other
  ),
  goals as (
    select jsonb_agg(jsonb_build_object(
             'id', g.id, 'metric', g.metric, 'target', g.target, 'period', g.period,
             'progress', public.dz_an_goal_progress(v_me, g.metric, g.period, g.scope),
             'achieved_at', g.achieved_at, 'created_at', g.created_at)
             order by g.created_at) as list
      from public.analytics_goals g where g.user_id = v_me and g.scope = v_sc
  ),
  feed as (
    select jsonb_agg(jsonb_build_object('event', event, 'at', at, 'title', title, 'artwork', aid)
                     order by at desc) as list
      from (
        select 'like'::text as event, l.created_at as at, m.title, m.id as aid
          from public.an_like l join mine m on m.id = l.subject_id where l.kind = v_sc
        union all
        select 'bookmark', b.created_at, m.title, m.id
          from public.an_bookmark b join mine m on m.id = b.subject_id where b.kind = v_sc
        union all
        select 'comment', c.created_at, m.title, m.id
          from public.item_comments c join mine m on m.id = c.subject_id
         where c.kind = v_sc and c.user_id <> v_me
        order by at desc limit 100
      ) s
  ),
  money as (
    select
      coalesce(sum(e.net_amount), 0)::bigint   as net,
      coalesce(sum(e.gross_amount), 0)::bigint as gross,
      coalesce(sum(e.fee_amount), 0)::bigint   as fees,
      count(*)::bigint                         as sales,
      coalesce(max(e.currency), (select currency from public.profiles where id = v_me), 'USD') as currency
      from public.marketplace_earnings e
     where e.seller_id = v_me
       and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
       and e.created_at::date between v_from and v_to
  ),
  money_all as (
    select
      coalesce(sum(e.net_amount), 0)::bigint as net,
      coalesce(sum(e.net_amount) filter (where e.available_at is not null
                                           and e.available_at <= now()), 0)::bigint as available,
      coalesce(sum(e.net_amount) filter (where e.available_at is null
                                           or e.available_at > now()), 0)::bigint as pending
      from public.marketplace_earnings e
     where e.seller_id = v_me
       and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
  ),
  mseries as (
    select jsonb_agg(jsonb_build_object('d', cal.day, 'net', coalesce(s.n, 0), 'sales', coalesce(s.c, 0))
                     order by cal.day) as list
      from (select gs::date as day from generate_series(v_from, v_to, interval '1 day') gs) cal
      left join (
        select e.created_at::date as day, coalesce(sum(e.net_amount), 0)::bigint as n,
               count(*)::bigint as c
          from public.marketplace_earnings e
         where e.seller_id = v_me
           and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
           and e.created_at::date between v_from and v_to
         group by 1
      ) s on s.day = cal.day
  )
  select jsonb_build_object(
    'scope', v_sc,
    'range', jsonb_build_object('days', v_days, 'from', v_from, 'to', v_to),
    'engagement', (select jsonb_build_object(
        'views', views, 'likes', likes, 'bookmarks', bookmarks, 'comments', comments,
        'downloads', downloads, 'shares', shares,
        'rate', case when views > 0
                     then round(((likes + bookmarks + comments + shares)::numeric / views) * 100, 1)
                     else 0 end,
        'like_rate',    case when views > 0 then round((likes::numeric / views) * 100, 1) else 0 end,
        'save_rate',    case when views > 0 then round((bookmarks::numeric / views) * 100, 1) else 0 end,
        'comment_rate', case when views > 0 then round((comments::numeric / views) * 100, 1) else 0 end
      ) from eng),
    'activity', coalesce((select list from feed), '[]'::jsonb),
    'account', jsonb_build_object(
      'cred_total',  (select count(*) from public.profile_creds c where c.receiver_id = v_me),
      'cred_gained', (select count(*) from public.profile_creds c
                       where c.receiver_id = v_me and c.created_at::date between v_from and v_to),
      'cred_given',  (select count(*) from public.profile_creds c where c.giver_id = v_me),
      'cred_givers', (select count(distinct c.giver_id) from public.profile_creds c
                       where c.receiver_id = v_me),
      'cred_series', coalesce((select list from cseries), '[]'::jsonb),
      'cred_recent', coalesce((select list from recent_cred), '[]'::jsonb),
      'profile_views', (select count(*) from public.analytics_events e
                         where e.owner_id = v_me and e.event = 'profile_view'
                           and e.day between v_from and v_to),
      'communities_owned',  (select count(*) from public.communities c where c.owner_id = v_me),
      'communities_joined', (select count(*) from public.community_members cm
                              where cm.user_id = v_me and coalesce(cm.banned, false) = false),
      'messages', (select count(*) from public.comments c
                    where c.user_id = v_me and c.created_at::date between v_from and v_to),
      'dms', (select count(*) from public.direct_messages d
               where d.sender_id = v_me and d.created_at::date between v_from and v_to),
      'comments_made', (select count(*) from public.item_comments c
                         where c.user_id = v_me and c.created_at::date between v_from and v_to),
      'friends', (select count(*) from public.friendships f
                   where f.status = 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)),
      'merit', (select coalesce(merit, 100) from public.profiles where id = v_me)
    ),
    'revenue', case when v_sc = 'marketplace' then (
        select jsonb_build_object(
          'currency', m.currency, 'net', m.net, 'gross', m.gross, 'fees', m.fees,
          'sales', m.sales, 'net_all', ma.net,
          'available', ma.available, 'pending', ma.pending,
          'series', coalesce((select list from mseries), '[]'::jsonb))
          from money m, money_all ma
      ) else null end,
    'goals',        coalesce((select list from goals), '[]'::jsonb),
    'achievements', public.dz_an_achievements(v_me, v_sc)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_analytics_content(p_days integer DEFAULT 30, p_scope text DEFAULT 'artwork'::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_me   uuid := auth.uid();
  v_sc   text := public.dz_an_scope(p_scope);
  v_to   date := current_date;
  v_from date := current_date - (public.dz_an_days(p_days) - 1);
  v_out  jsonb;
begin
  if v_me is null then return jsonb_build_object('error', 'auth'); end if;

  with mine as (select i.* from public.an_item i where i.user_id = v_me and i.kind = v_sc),
  g_views as (select d.subject_id as id, count(*)::bigint as n
                from public.an_view d join mine m on m.id = d.subject_id
               where d.kind = v_sc and d.day between v_from and v_to group by 1),
  g_dls as (select d.subject_id as id, count(*)::bigint as n
              from public.an_download d join mine m on m.id = d.subject_id
             where d.kind = v_sc and d.day between v_from and v_to group by 1),
  g_likes as (select l.subject_id as id, count(*)::bigint as n
                from public.an_like l join mine m on m.id = l.subject_id
               where l.kind = v_sc and l.created_at::date between v_from and v_to group by 1),
  g_bms as (select b.subject_id as id, count(*)::bigint as n
              from public.an_bookmark b join mine m on m.id = b.subject_id
             where b.kind = v_sc and b.created_at::date between v_from and v_to group by 1),
  g_cms as (select c.subject_id as id, count(*)::bigint as n
              from public.item_comments c join mine m on m.id = c.subject_id
             where c.kind = v_sc and c.user_id <> v_me
               and c.created_at::date between v_from and v_to group by 1),
  g_sales as (select e.item_id as id, count(*)::bigint as n
                from public.marketplace_earnings e
               where v_sc = 'marketplace' and e.seller_id = v_me
                 and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
                 and e.created_at::date between v_from and v_to group by 1),
  win as (
    select m.*,
           coalesce(gv.n, 0) as w_views,
           coalesce(gd.n, 0) as w_downloads,
           coalesce(gl.n, 0) as w_likes,
           coalesce(gb.n, 0) as w_bookmarks,
           coalesce(gc.n, 0) as w_comments,
           coalesce(gs.n, 0) as w_sales
      from mine m
      left join g_views gv on gv.id = m.id
      left join g_dls   gd on gd.id = m.id
      left join g_likes gl on gl.id = m.id
      left join g_bms   gb on gb.id = m.id
      left join g_cms   gc on gc.id = m.id
      left join g_sales gs on gs.id = m.id
  ),
  art_rows as (
    select jsonb_agg(x order by ord) as list from (
      select row_number() over (order by w_views desc, w_likes desc, created_at desc) as ord,
             jsonb_build_object(
               'id', id, 'title', title, 'thumb', thumb,
               'category', coalesce(category[1], 'others'),
               'created_at', created_at,
               'status', status, 'visibility', visibility,
               'featured', featured, 'mature', is_mature,
               'views', w_views, 'likes', w_likes, 'bookmarks', w_bookmarks,
               'downloads', w_downloads, 'comments', w_comments, 'sales', w_sales,
               'views_all', view_count, 'likes_all', like_count,
               'bookmarks_all', bookmark_count, 'downloads_all', download_count,
               'sales_all', sales_count, 'price_cents', price_cents,
               'engagement', case when w_views > 0
                                  then round(((w_likes + w_bookmarks + w_comments)::numeric / w_views) * 100, 1)
                                  else 0 end
             ) as x
        from win
       order by w_views desc, w_likes desc, created_at desc
       limit 200
    ) s
  ),
  cats as (
    select jsonb_agg(jsonb_build_object('key', k, 'artworks', n, 'views', v, 'likes', l)
                     order by v desc, n desc) as list
      from (
        select coalesce(category[1], 'others') as k, count(*)::bigint as n,
               sum(w_views)::bigint as v, sum(w_likes)::bigint as l
          from win group by 1
      ) s
  ),
  tags as (
    select jsonb_agg(jsonb_build_object('key', k, 'artworks', n, 'views', v)
                     order by v desc, n desc) as list
      from (
        select lower(btrim(t)) as k, count(*)::bigint as n, sum(w.w_views)::bigint as v
          from win w, unnest(w.tags) as t
         where btrim(t) <> '' group by 1 order by v desc, n desc limit 20
      ) s
  ),
  soft as (
    select jsonb_agg(jsonb_build_object('key', k, 'artworks', n, 'views', v)
                     order by v desc, n desc) as list
      from (
        select lower(btrim(s2)) as k, count(*)::bigint as n, sum(w.w_views)::bigint as v
          from win w, unnest(w.software) as s2
         where btrim(s2) <> '' group by 1 order by v desc, n desc limit 12
      ) s
  ),
  cadence as (
    select jsonb_agg(jsonb_build_object('month', mth, 'uploads', n) order by mth) as list
      from (
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as mth, count(*)::bigint as n
          from mine
         where created_at >= (date_trunc('month', now()) - interval '11 months')
         group by 1
      ) s
  ),
  shape as (
    select
      count(*)::bigint                                          as artworks,
      count(*) filter (where is_mature)::bigint                 as mature,
      count(*) filter (where featured)::bigint                  as featured,
      count(*) filter (where visibility is distinct from 'published')::bigint as unlisted,
      count(*) filter (where status = 'approved')::bigint       as approved,
      count(*) filter (where license is not null)::bigint       as licensed,
      coalesce(round(avg(view_count), 1), 0)::numeric           as avg_views,
      coalesce(round(avg(like_count), 1), 0)::numeric           as avg_likes,
      min(created_at) as first_upload,
      max(created_at) as last_upload
      from mine
  )
  select jsonb_build_object(
    'scope',       v_sc,
    'range',       jsonb_build_object('from', v_from, 'to', v_to),
    'artworks',    coalesce((select list from art_rows), '[]'::jsonb),
    'by_category', coalesce((select list from cats), '[]'::jsonb),
    'by_tag',      coalesce((select list from tags), '[]'::jsonb),
    'by_software', coalesce((select list from soft), '[]'::jsonb),
    'cadence',     coalesce((select list from cadence), '[]'::jsonb),
    'shape',       (select to_jsonb(s) from shape s)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_analytics_goal_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if (select count(*) from public.analytics_goals where user_id = new.user_id) >= 12 then
    raise exception 'goal limit reached' using errcode = 'check_violation';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_analytics_overview(p_days integer DEFAULT 30, p_scope text DEFAULT 'artwork'::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_me    uuid := auth.uid();
  v_days  int  := public.dz_an_days(p_days);
  v_sc    text := public.dz_an_scope(p_scope);
  v_to    date := current_date;
  v_from  date := current_date - (v_days - 1);
  v_pto   date := current_date - v_days;
  v_pfrom date := current_date - (2 * v_days - 1);
  v_out   jsonb;
begin
  if v_me is null then return jsonb_build_object('error', 'auth'); end if;

  with mine as (
    select i.id, i.created_at::date as made
      from public.an_item i where i.user_id = v_me and i.kind = v_sc
  ),
  daily as (
    select d.day as day, 'views'::text as metric, count(*)::bigint as n
      from public.an_view d join mine m on m.id = d.subject_id
     where d.kind = v_sc and d.day between v_pfrom and v_to group by d.day
    union all
    select d.day, 'downloads', count(*)::bigint
      from public.an_download d join mine m on m.id = d.subject_id
     where d.kind = v_sc and d.day between v_pfrom and v_to group by d.day
    union all
    select l.created_at::date, 'likes', count(*)::bigint
      from public.an_like l join mine m on m.id = l.subject_id
     where l.kind = v_sc and l.created_at::date between v_pfrom and v_to group by 1
    union all
    select b.created_at::date, 'bookmarks', count(*)::bigint
      from public.an_bookmark b join mine m on m.id = b.subject_id
     where b.kind = v_sc and b.created_at::date between v_pfrom and v_to group by 1
    union all
    select c.created_at::date, 'comments', count(*)::bigint
      from public.item_comments c join mine m on m.id = c.subject_id
     where c.kind = v_sc and c.user_id <> v_me
       and c.created_at::date between v_pfrom and v_to group by 1
    union all
    select e.day, 'shares', count(*)::bigint
      from public.analytics_events e
     where e.owner_id = v_me and e.scope = v_sc and e.event = 'share'
       and e.day between v_pfrom and v_to group by e.day
    union all
    select m.made, 'uploads', count(*)::bigint
      from mine m where m.made between v_pfrom and v_to group by m.made
    union all
    select e.created_at::date, 'sales', count(*)::bigint
      from public.marketplace_earnings e
     where v_sc = 'marketplace' and e.seller_id = v_me
       and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
       and e.created_at::date between v_pfrom and v_to group by 1
  ),
  cal as (select gs::date as day from generate_series(v_from, v_to, interval '1 day') gs),
  per_day as (
    select cal.day,
           coalesce(sum(n) filter (where metric = 'views'), 0)::bigint     as views,
           coalesce(sum(n) filter (where metric = 'likes'), 0)::bigint     as likes,
           coalesce(sum(n) filter (where metric = 'bookmarks'), 0)::bigint as bookmarks,
           coalesce(sum(n) filter (where metric = 'downloads'), 0)::bigint as downloads,
           coalesce(sum(n) filter (where metric = 'comments'), 0)::bigint  as comments,
           coalesce(sum(n) filter (where metric = 'shares'), 0)::bigint    as shares,
           coalesce(sum(n) filter (where metric = 'uploads'), 0)::bigint   as uploads,
           coalesce(sum(n) filter (where metric = 'sales'), 0)::bigint     as sales
      from cal left join daily on daily.day = cal.day group by cal.day
  ),
  series as (
    select jsonb_agg(jsonb_build_object(
             'd', day, 'views', views, 'likes', likes, 'bookmarks', bookmarks,
             'downloads', downloads, 'comments', comments, 'shares', shares,
             'uploads', uploads, 'sales', sales) order by day) as rows
      from per_day
  ),
  names (metric) as (values ('views'),('likes'),('bookmarks'),('downloads'),
                            ('comments'),('shares'),('uploads'),('sales')),
  win as (
    select names.metric,
           coalesce(sum(d.n) filter (where d.day between v_from  and v_to),  0)::bigint as cur,
           coalesce(sum(d.n) filter (where d.day between v_pfrom and v_pto), 0)::bigint as prev
      from names left join daily d on d.metric = names.metric group by names.metric
  ),
  totals as (
    select
      (select count(*) from mine)::bigint as items,
      (select count(*) from public.an_view v join mine m on m.id = v.subject_id
        where v.kind = v_sc)::bigint as views_all,
      (select count(*) from public.an_like l join mine m on m.id = l.subject_id
        where l.kind = v_sc)::bigint as likes_all,
      (select count(*) from public.an_bookmark b join mine m on m.id = b.subject_id
        where b.kind = v_sc)::bigint as bookmarks_all,
      (select count(*) from public.an_download d join mine m on m.id = d.subject_id
        where d.kind = v_sc)::bigint as downloads_all,
      (select count(*) from public.item_comments c join mine m on m.id = c.subject_id
        where c.kind = v_sc and c.user_id <> v_me)::bigint as comments_all,
      (select count(*) from public.analytics_events e
        where e.owner_id = v_me and e.scope = v_sc and e.event = 'share')::bigint as shares_all,
      (select count(*) from public.marketplace_earnings e
        where v_sc = 'marketplace' and e.seller_id = v_me
          and coalesce(e.status, '') not in ('refunded','reversed','cancelled'))::bigint as sales_all
  ),
  peers as (
    select i.user_id, count(*)::bigint as n
      from public.an_view d
      join public.an_item i on i.id = d.subject_id and i.kind = d.kind
     where d.kind = v_sc and d.day between v_from and v_to and i.user_id is not null
     group by i.user_id
  ),
  mine_views as (select coalesce(max(cur), 0)::bigint as n from win where metric = 'views'),
  peerstat as (
    select
      coalesce(percentile_cont(0.5) within group (order by p.n), 0)::bigint as median_views,
      coalesce(round(avg(p.n), 1), 0)::numeric                              as avg_views,
      count(*)::bigint                                                      as artists,
      count(*) filter (where p.n <= (select n from mine_views))::bigint     as below
      from peers p
  )
  select jsonb_build_object(
    'scope',  v_sc,
    'range',  jsonb_build_object('days', v_days, 'from', v_from, 'to', v_to,
                                 'prev_from', v_pfrom, 'prev_to', v_pto),
    'series', coalesce((select rows from series), '[]'::jsonb),
    'window', (select coalesce(jsonb_object_agg(metric, cur), '{}'::jsonb) from win),
    'prev',   (select coalesce(jsonb_object_agg(metric, prev), '{}'::jsonb) from win),
    'totals', (select to_jsonb(t) from totals t),
    'compare', (select jsonb_build_object(
                  'my_views',     (select n from mine_views),
                  'median_views', ps.median_views,
                  'avg_views',    ps.avg_views,
                  'artists',      ps.artists,
                  'percentile',   case when ps.artists > 0
                                       then round((ps.below::numeric / ps.artists) * 100)
                                       else 0 end)
                 from peerstat ps)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_analytics_reach(p_days integer DEFAULT 30, p_scope text DEFAULT 'artwork'::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_me   uuid := auth.uid();
  v_sc   text := public.dz_an_scope(p_scope);
  v_to   date := current_date;
  v_from date := current_date - (public.dz_an_days(p_days) - 1);
  v_out  jsonb;
begin
  if v_me is null then return jsonb_build_object('error', 'auth'); end if;

  with mine as (select i.id from public.an_item i where i.user_id = v_me and i.kind = v_sc),
  ev as (
    select e.event, e.source, e.referrer_host, e.country, e.device, e.term, e.created_at
      from public.analytics_events e
     where e.owner_id = v_me and e.day between v_from and v_to
       and e.scope = v_sc
  ),
  seen as (
    select d.viewer_key, count(distinct d.day)::int as days
      from public.an_view d join mine m on m.id = d.subject_id
     where d.kind = v_sc and d.day between v_from and v_to
     group by d.viewer_key
  ),
  countries as (
    select jsonb_agg(jsonb_build_object('key', k, 'n', n) order by n desc) as list
      from (select country as k, count(*)::bigint n from ev
             where country is not null and event in ('view','download')
             group by 1 order by n desc limit 12) s
  ),
  devices as (
    select jsonb_agg(jsonb_build_object('key', k, 'n', n) order by n desc) as list
      from (select device as k, count(*)::bigint n from ev
             where event in ('view','download') group by 1) s
  ),
  sources as (
    select jsonb_agg(jsonb_build_object('key', k, 'n', n) order by n desc) as list
      from (select source as k, count(*)::bigint n from ev
             where event in ('view','download') group by 1) s
  ),
  referrers as (
    select jsonb_agg(jsonb_build_object('key', k, 'n', n) order by n desc) as list
      from (select referrer_host as k, count(*)::bigint n from ev
             where referrer_host is not null and event in ('view','download')
             group by 1 order by n desc limit 10) s
  ),
  hours as (
    select jsonb_agg(jsonb_build_object('h', h, 'n', coalesce(s.n, 0)) order by h) as list
      from generate_series(0, 23) h
      left join (select extract(hour from created_at at time zone 'UTC')::int as hh,
                        count(*)::bigint as n
                   from ev where event = 'view' group by 1) s on s.hh = h
  ),
  weekdays as (
    select jsonb_agg(jsonb_build_object('w', w, 'n', coalesce(s.n, 0)) order by w) as list
      from generate_series(0, 6) w
      left join (select extract(dow from d.day)::int as ww, count(*)::bigint as n
                   from public.an_view d join mine m on m.id = d.subject_id
                  where d.kind = v_sc and d.day between v_from and v_to group by 1) s on s.ww = w
  ),
  fans as (
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', coalesce(nullif(p.display_name, ''), p.username, 'Artist'),
             'handle', p.username, 'avatar', p.avatar_url, 'n', f.n) order by f.n desc) as list
      from (
        select uid, count(*)::bigint as n from (
          select l.user_id as uid from public.an_like l join mine m on m.id = l.subject_id
           where l.kind = v_sc and l.created_at::date between v_from and v_to
          union all
          select b.user_id from public.an_bookmark b join mine m on m.id = b.subject_id
           where b.kind = v_sc and b.created_at::date between v_from and v_to
          union all
          select c.user_id from public.item_comments c join mine m on m.id = c.subject_id
           where c.kind = v_sc and c.created_at::date between v_from and v_to
        ) u where uid is not null and uid <> v_me
        group by uid order by n desc limit 8
      ) f join public.profiles p on p.id = f.uid
  ),
  terms as (
    select jsonb_agg(jsonb_build_object(
             'term', term, 'impressions', imp, 'clicks', clk,
             'ctr', case when imp > 0 then round((clk::numeric / imp) * 100, 1) else 0 end)
             order by imp desc, clk desc) as list
      from (
        select term,
               count(*) filter (where event = 'search_impression')::bigint as imp,
               count(*) filter (where event = 'search_click')::bigint      as clk
          from ev where term is not null group by term
         order by imp desc limit 15
      ) s
  )
  select jsonb_build_object(
    'scope', v_sc,
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'audience', jsonb_build_object(
      'viewers',   (select count(*) from seen),
      'returning', (select count(*) from seen where days > 1),
      'new',       (select count(*) from seen where days = 1),
      'signed_in', (select count(*) from seen where viewer_key like 'u:%'),
      'days_per_viewer', (select case when count(*) > 0
                                      then round(sum(days)::numeric / count(*), 2)
                                      else 0 end from seen),
      'top_fans',   coalesce((select list from fans), '[]'::jsonb),
      'by_hour',    coalesce((select list from hours), '[]'::jsonb),
      'by_weekday', coalesce((select list from weekdays), '[]'::jsonb)
    ),
    'countries', coalesce((select list from countries), '[]'::jsonb),
    'devices',   coalesce((select list from devices), '[]'::jsonb),
    'sources',   coalesce((select list from sources), '[]'::jsonb),
    'referrers', coalesce((select list from referrers), '[]'::jsonb),
    'search', jsonb_build_object(
      'terms',       coalesce((select list from terms), '[]'::jsonb),
      'impressions', (select count(*) from ev where event = 'search_impression'),
      'clicks',      (select count(*) from ev where event = 'search_click')
    ),
    'dimension_rows', (select count(*) from ev)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_analytics_track(p_event text, p_subject uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'artwork'::text, p_owner uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_term text DEFAULT NULL::text, p_anon_key text DEFAULT NULL::text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_key    text;
  v_owner  uuid;
  v_source text;
  v_device text;
  v_term   text;
  v_ref    text;
  v_scope  text;
  v_actor  uuid;
begin
  if p_event is null then return; end if;

  if p_event not in ('like','unlike','bookmark','unbookmark','comment','share',
                     'profile_view','search_impression','search_click',
                     'follow','unfollow','cred') then
    return;
  end if;

  v_key := public.dz_an_viewer_key(p_anon_key);
  if v_key is null then return; end if;

  if not public.dz_rate_ok('an:' || v_key, 240, 60) then return; end if;

  v_scope := lower(coalesce(p_scope, 'artwork'));
  if v_scope = 'resources' then v_scope := 'resource'; end if;

  if p_subject is not null and v_scope = 'artwork' then
    select a.user_id into v_owner from public.artworks a
     where a.id = p_subject and a.status = 'approved';
  elsif p_subject is not null and v_scope = 'marketplace' then
    select m.user_id into v_owner from public.marketplace_items m
     where m.id = p_subject and m.status = 'approved' and m.visibility = 'published';
  elsif p_subject is not null and v_scope = 'blog' then
    select b.user_id into v_owner from public.blog_posts b
     where b.id = p_subject and b.status = 'approved' and b.visibility = 'published';
  elsif p_subject is not null and v_scope = 'resource' then
    select r.user_id into v_owner from public.resources r
     where r.id = p_subject and r.status = 'approved' and r.visibility = 'published';
  elsif p_event in ('profile_view','follow','unfollow','cred') and p_owner is not null then
    select p.id into v_owner from public.profiles p where p.id = p_owner;
  end if;
  if v_owner is null then return; end if;

  if auth.uid() is not null and auth.uid() = v_owner then return; end if;

  v_source := lower(coalesce(p_source, 'direct'));
  if v_source not in ('direct','social','search','referral','internal') then
    v_source := 'direct';
  end if;

  v_device := lower(coalesce(p_device, 'unknown'));
  if v_device not in ('mobile','tablet','desktop') then
    v_device := 'unknown';
  end if;

  v_term := nullif(btrim(lower(coalesce(p_term, ''))), '');
  if v_term is not null then v_term := left(v_term, 80); end if;
  if p_event not in ('search_impression','search_click') then v_term := null; end if;

  v_ref := nullif(btrim(lower(coalesce(p_ref, ''))), '');
  if v_ref is not null then
    v_ref := nullif(left(regexp_replace(v_ref, '[^a-z0-9.:-]', '', 'g'), 120), '');
  end if;

  if p_event in ('profile_view','follow','unfollow','cred') then
    v_scope := 'profile';
  end if;
  if v_scope not in ('artwork','marketplace','blog','resource','profile') then
    v_scope := 'artwork';
  end if;

  if p_event = 'cred' then
    v_actor := null;
    v_key := 'c:' || md5('dzcred|' || v_key);
  else
    v_actor := auth.uid();
  end if;

  insert into public.analytics_events
    (owner_id, actor_id, viewer_key, scope, subject_id, event,
     source, referrer_host, country, device, term)
  values
    (v_owner, v_actor, v_key, v_scope, p_subject, p_event,
     v_source, v_ref, public.dz_an_country(p_country), v_device, v_term)
  on conflict do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_analytics_track_search(p_subjects uuid[], p_term text, p_source text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_anon_key text DEFAULT NULL::text, p_scope text DEFAULT 'artwork'::text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_id uuid; v_n int := 0;
begin
  if p_subjects is null or p_term is null or btrim(p_term) = '' then return; end if;
  foreach v_id in array p_subjects loop
    v_n := v_n + 1;
    exit when v_n > 12;
    perform public.dz_analytics_track(
      'search_impression', v_id, coalesce(p_scope, 'artwork'), null,
      p_source, p_ref, p_device, p_country, p_term, p_anon_key);
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_artwork_mod_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_secret text;
  v_uid    uuid := auth.uid();
  parts    text[];
  v_exp    bigint;
  v_jti    text;
  v_sig    text;
  v_calc   text;
begin
  if NEW.status is distinct from 'approved' then return NEW; end if;

  if v_uid is null then return NEW; end if;

  select secret into v_secret from private.mod_config where id = true;
  if v_secret is null or v_secret = '' then return NEW; end if;

  if public.is_dev() then NEW.mod_token := null; return NEW; end if;

  parts := string_to_array(coalesce(NEW.mod_token, ''), '.');
  if array_length(parts, 1) is distinct from 3 then
    NEW.status := 'pending'; NEW.mod_token := null; return NEW;
  end if;

  begin
    v_exp := (parts[1])::bigint;
  exception when others then
    NEW.status := 'pending'; NEW.mod_token := null; return NEW;
  end;

  v_jti  := parts[2];
  v_sig  := parts[3];
  v_calc := encode(
    extensions.hmac(v_uid::text || '.' || parts[1] || '.' || v_jti, v_secret, 'sha256'),
    'hex');

  if v_sig = v_calc and v_exp > extract(epoch from now())::bigint then
    begin
      insert into private.used_mod_tokens (jti, user_id) values (v_jti, v_uid);
      NEW.mod_token := null;
      return NEW;
    exception when unique_violation then
      NEW.status := 'pending'; NEW.mod_token := null; return NEW;
    end;
  end if;

  NEW.status := 'pending'; NEW.mod_token := null; return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dz_audit(p_action text, p_target uuid, p_meta jsonb DEFAULT '{}'::jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  insert into public.audit_log (actor_id, actor_role, action, target_id, metadata)
  values (auth.uid(), public.dz_role(auth.uid()), p_action, p_target,
          coalesce(p_meta, '{}'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.dz_audit_log(p_limit integer DEFAULT 100, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(id bigint, created_at timestamp with time zone, action text, actor_id uuid, actor_username text, actor_role text, target_id uuid, target_username text, metadata jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_is_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  select a.id, a.created_at, a.action,
         a.actor_id, ap.username, a.actor_role,
         a.target_id, tp.username, a.metadata
    from public.audit_log a
    left join public.profiles ap on ap.id = a.actor_id
    left join public.profiles tp on tp.id = a.target_id
   where p_before is null or a.created_at < p_before
   order by a.created_at desc, a.id desc
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_auth_churn(p_hours integer DEFAULT 24) RETURNS TABLE(ip text, accounts bigint, logins bigint, failures bigint, signups bigint, first_at timestamp with time zone, last_at timestamp with time zone) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if to_regprocedure('public.dz_is_staff()') is not null then
    if not public.dz_is_staff() then raise exception 'staff only' using errcode='42501'; end if;
  elsif to_regprocedure('public.is_dev()') is not null then
    if not public.is_dev() then raise exception 'staff only' using errcode='42501'; end if;
  else
    raise exception 'staff only' using errcode='42501';
  end if;
  return query
    select a.ip,
           count(distinct a.email_key) filter (where a.email_key is not null),
           count(*) filter (where a.event='login'),
           count(*) filter (where a.event='login' and a.ok is false),
           count(*) filter (where a.event='signup'),
           min(a.created_at), max(a.created_at)
      from public.auth_attempts a
     where a.created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_hours,24),168)))
     group by a.ip
     having count(distinct a.email_key) > 1 or count(*) filter (where a.event='login' and a.ok is false) > 2
     order by count(distinct a.email_key) desc, count(*) desc;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_ban_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return new; end if;
  if public.dz_is_banned(v_uid) then
    raise exception 'Your account is suspended. Contact DigiArtzsupport@gmail.com'
      using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_ban_user(p_target uuid, p_reason text, p_note text DEFAULT NULL::text, p_days integer DEFAULT NULL::integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_expires timestamptz;
  v_id      uuid;
begin
  if not public.dz_may_moderate(auth.uid(), p_target) then
    raise exception 'not allowed';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 2 then
    raise exception 'a reason is required';
  end if;

  v_expires := case when p_days is null or p_days <= 0
                    then null
                    else now() + make_interval(days => least(p_days, 3650)) end;

  insert into public.user_bans (user_id, reason, note, banned_by, expires_at)
  values (p_target, btrim(p_reason), nullif(btrim(coalesce(p_note, '')), ''),
          auth.uid(), v_expires)
  on conflict (user_id) where lifted_at is null
  do update set reason     = excluded.reason,
                note       = excluded.note,
                banned_by  = excluded.banned_by,
                banned_at  = now(),
                expires_at = excluded.expires_at
  returning id into v_id;

  perform public.dz_audit('ban_user', p_target, jsonb_build_object(
    'ban_id', v_id, 'reason', btrim(p_reason), 'expires_at', v_expires));

  return jsonb_build_object('ok', true, 'ban_id', v_id, 'expires_at', v_expires);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_bounds_on_change() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
declare
  i        int;
  col      text;
  lo       int;
  hi       int;
  nullable boolean;
  newv     text;
  oldv     text;
begin
  i := 0;
  while i < TG_NARGS loop
    col      := TG_ARGV[i];
    lo       := TG_ARGV[i + 1]::int;
    hi       := TG_ARGV[i + 2]::int;
    nullable := TG_ARGV[i + 3] = 'null-ok';

    execute format('select ($1).%I::text', col) into newv using NEW;
    if TG_OP = 'UPDATE' then
      execute format('select ($1).%I::text', col) into oldv using OLD;
    else
      oldv := null;
    end if;

    if TG_OP = 'INSERT' or newv is distinct from oldv then
      if newv is null then
        if not nullable then
          raise exception '% is required', col using errcode = '23514';
        end if;
      elsif char_length(btrim(newv)) < lo or char_length(btrim(newv)) > hi then
        raise exception '% must be between % and % characters', col, lo, hi
          using errcode = '23514';
      end if;
    end if;

    i := i + 4;
  end loop;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_captcha_required() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_ip text; v_since timestamptz := now() - interval '1 hour';
        v_accts int; v_fails int; v_signup int;
begin
  if to_regprocedure('public.dz_client_ip()') is not null then
    begin v_ip := public.dz_client_ip(); exception when others then v_ip := null; end;
  end if;
  if v_ip is null or v_ip = '' then return false; end if;
  select count(distinct email_key) filter (where event='login' and email_key is not null),
         count(*) filter (where event='login' and ok is false),
         count(*) filter (where event='signup')
    into v_accts, v_fails, v_signup
    from public.auth_attempts where ip = v_ip and created_at > v_since;
  return coalesce(v_accts,0) >= 3 or coalesce(v_fails,0) >= 5 or coalesce(v_signup,0) >= 2;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_chat_gate(p_scope text, p_text text, p_channel text DEFAULT NULL::text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_uid     uuid := auth.uid();
  v_hash    text;
  v_now     timestamptz := clock_timestamp();
  v_cd      record;
  v_last    timestamptz;
  v_dupe    timestamptz;
  v_strikes int;
  v_wait    int;
  v_reason  text := null;
  v_cid     uuid;
begin
  if v_uid is null then return true; end if;

  select * into v_cd from public.chat_cooldowns where user_id = v_uid;
  if v_cd.until is not null and v_cd.until > v_now then
    return false;
  end if;

  v_hash := md5(lower(btrim(coalesce(p_text, ''))));

  select max(created_at) into v_dupe from public.chat_rate_events e
   where e.user_id = v_uid and e.body_hash = v_hash
     and e.created_at > v_now - interval '30 seconds';
  if v_dupe is not null then
    insert into public.chat_cooldowns (user_id, strikes, until, last_strike_at, reason)
    values (v_uid, coalesce(v_cd.strikes, 0), v_dupe + interval '30 seconds',
            v_cd.last_strike_at, 'You just sent that')
    on conflict (user_id) do update
      set until = excluded.until, reason = excluded.reason;
    return false;
  end if;

  select max(created_at) into v_last
    from public.chat_rate_events where user_id = v_uid;
  if v_last is not null and v_last > v_now - interval '1 second' then
    v_reason := 'You are sending faster than one message a second';
  end if;

  if v_reason is null then
    if (select count(*) from public.chat_rate_events
         where user_id = v_uid and created_at > v_now - interval '24 hours') >= 3000 then
      v_reason := 'That is 3000 messages today';
    elsif (select count(*) from public.chat_rate_events
            where user_id = v_uid and created_at > v_now - interval '1 hour') >= 500 then
      v_reason := 'That is 500 messages in an hour';
    elsif (select count(*) from public.chat_rate_events
            where user_id = v_uid and created_at > v_now - interval '10 minutes') >= 150 then
      v_reason := 'That is 150 messages in ten minutes';
    elsif (select count(*) from public.chat_rate_events
            where user_id = v_uid and created_at > v_now - interval '1 minute') >= 30 then
      v_reason := 'That is 30 messages in a minute';
    elsif (select count(*) from public.chat_rate_events
            where user_id = v_uid and created_at > v_now - interval '10 seconds') >= 5 then
      v_reason := 'That is 5 messages in ten seconds';
    end if;
  end if;

  if v_reason is not null then
    v_strikes := coalesce(v_cd.strikes, 0);
    if v_cd.last_strike_at is null or v_cd.last_strike_at < v_now - interval '1 hour' then
      v_strikes := 0;
    end if;
    v_strikes := v_strikes + 1;
    v_wait := case least(v_strikes, 5)
                when 1 then 10 when 2 then 30 when 3 then 120
                when 4 then 600 else 3600 end;

    insert into public.chat_cooldowns (user_id, strikes, until, last_strike_at, reason)
    values (v_uid, v_strikes, v_now + make_interval(secs => v_wait), v_now, v_reason)
    on conflict (user_id) do update
      set strikes = excluded.strikes, until = excluded.until,
          last_strike_at = excluded.last_strike_at, reason = excluded.reason;

    if v_strikes > 5 and p_channel is not null then
      v_cid := public.community_channel_id(p_channel);
      if v_cid is not null then
        update public.community_members
           set timeout_until = greatest(coalesce(timeout_until, v_now), v_now + interval '1 hour')
         where community_id = v_cid and user_id = v_uid;
      end if;
    end if;
    return false;
  end if;

  insert into public.chat_rate_events (user_id, scope, body_hash)
  values (v_uid, p_scope, v_hash);

  if random() < 0.002 then
    delete from public.chat_rate_events where created_at < v_now - interval '25 hours';
    delete from public.chat_cooldowns
     where coalesce(until, last_strike_at) < v_now - interval '2 hours';
  end if;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_chat_gate_comments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if public.dz_chat_gate('community', new.comment_text, new.channel) then
    return new;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_chat_gate_dm() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if public.dz_chat_gate('dm', new.content, null) then
    return new;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_chat_status() RETURNS TABLE(cooldown_seconds integer, strikes integer, reason text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select
    greatest(0, coalesce(ceil(extract(epoch from (c.until - now())))::int, 0)),
    coalesce(c.strikes, 0),
    c.reason
  from (select 1) one
  left join public.chat_cooldowns c on c.user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.dz_claim_max() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_until timestamptz;
begin
  if not public.dz_is_partner(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from public.profiles
              where id = auth.uid() and max_claimed) then
    return jsonb_build_object('ok', true, 'changed', false, 'tier', 'max');
  end if;

  v_until := now() + interval '100 years';

  update public.profiles
     set subscription_tier = 'max',
         subscription_expires_at = greatest(
           coalesce(subscription_expires_at, v_until), v_until),
         max_claimed = true
   where id = auth.uid();

  perform public.dz_audit('claim_max', auth.uid(),
    jsonb_build_object('until', v_until));

  return jsonb_build_object('ok', true, 'changed', true, 'tier', 'max',
                            'until', v_until);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_client_ip() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_raw text;
  v_hdr json;
  v_ip  text;
begin
  v_raw := nullif(current_setting('request.headers', true), '');
  if v_raw is null then
    return null;
  end if;

  begin
    v_hdr := v_raw::json;
  exception when others then
    return null;
  end;

  v_ip := coalesce(
    nullif(btrim(coalesce(v_hdr ->> 'cf-connecting-ip', '')), ''),
    nullif(btrim(coalesce(v_hdr ->> 'true-client-ip',  '')), ''),
    nullif(btrim(coalesce(v_hdr ->> 'x-real-ip',       '')), ''),
    nullif(btrim(split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1)), '')
  );

  return left(v_ip, 64);
end
$function$;

CREATE OR REPLACE FUNCTION public.dz_comment_community_open() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare cid uuid;
begin
  if new.channel is null or left(new.channel, 2) <> 'c:' then
    return new;
  end if;
  begin
    cid := substring(new.channel from 3)::uuid;
  exception when others then
    return new;
  end;
  if public.cm_state(cid) = 'locked' then
    raise exception 'CM_LOCKED' using errcode='P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_content_fingerprint(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
  select case
    when length(regexp_replace(public.dz_deobfuscate(p_text),'[^a-z0-9]+','','g')) < 30 then null
    else md5(regexp_replace(public.dz_deobfuscate(p_text),'[^a-z0-9]+','','g')) end;
$function$;

CREATE OR REPLACE FUNCTION public.dz_content_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_col text := coalesce(nullif(TG_ARGV[0],''),'body');
  v_text text; v_row json := row_to_json(NEW); v_dev boolean := false;
begin
  v_text := v_row ->> v_col;
  if v_text is null or btrim(v_text) = '' then return NEW; end if;
  if to_regprocedure('public.is_dev()') is not null then
    begin v_dev := public.is_dev(); exception when others then v_dev := false; end;
  end if;
  if v_dev then return NEW; end if;
  if public.dz_has_link(v_text) then
    raise exception 'Links aren''t allowed here — say it without the address.' using errcode='P0001';
  end if;
  if public.dz_phish_score(v_text) >= 2 then
    perform public.dz_log_abuse(TG_TABLE_NAME,'phish',v_col,v_text);
    return null;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_deobfuscate(p_text text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
declare t text;
begin
  t := lower(coalesce(p_text, ''));
  if t = '' then return ''; end if;
  t := replace(t, '%25', '%'); t := replace(t, '%25', '%');
  t := replace(t, '%2e', '.'); t := replace(t, '%2f', '/');
  t := replace(t, '%3a', ':'); t := replace(t, '%40', '@');
  t := replace(t, '&#46;', '.'); t := replace(t, '&period;', '.'); t := replace(t, '&#x2e;', '.');
  t := regexp_replace(t, '[' || E'­​‌‍‎‏‪‫‬' || E'‭‮⁠⁡⁢⁣⁤﻿' || ']', '', 'g');
  t := translate(t, E'․．。﹒۔܁∙⋅·•ꓸ', '...........');
  t := translate(t, E'ａｂｃｄｅｆｇｈｉｊｋ'||E'ｌｍｎｏｐｑｒｓｔｕｖ'||E'ｗｘｙｚ０１２３４５６'||E'７８９：／＠',
                    'abcdefghijklmnopqrstuvwxyz0123456789:/@');
  t := translate(t, E'аеорсхуѕіј'||E'ӏԛԁһɡορυνα'||E'τκηΒΕ', 'aeopcxysijldqdhgopvnatkhbe');
  t := translate(t, E'àáâãäåèéêë'||E'ìíîïòóôõöù'||E'úûüýÿñç', 'aaaaaaeeeeiiiiooooouuuuyync');
  t := regexp_replace(t, '\s*[\(\[\{<]\s*(dot|punto|punkt|d0t|daht)\s*[\)\]\}>]\s*', '.', 'g');
  t := regexp_replace(t, '\s*[\(\[\{<]\s*\.\s*[\)\]\}>]\s*', '.', 'g');
  t := regexp_replace(t, '\s+(dot|punto|punkt|d0t|daht)\s+', '.', 'g');
  t := regexp_replace(t, '\s*[\(\[\{<]\s*(at|arroba)\s*[\)\]\}>]\s*', '@', 'g');
  t := regexp_replace(t, '\s+(at|arroba)\s+(?=[a-z0-9._-]+\.[a-z]{2,})', '@', 'g');
  t := regexp_replace(t, 'h[x*#]{2}ps?', 'http', 'g');
  t := regexp_replace(t, 'h\s*t\s*t\s*p\s*s?\s*(?=:)', 'http', 'g');
  t := regexp_replace(t, '\s+\.\s*', '.', 'g');
  t := regexp_replace(t, '\s+@\s*', '@', 'g');
  t := regexp_replace(t, '\s*:\s*//', '://', 'g');
  t := regexp_replace(t, '(?<=[a-z0-9])\s*/\s*(?=[a-z0-9])', '/', 'g');
  t := regexp_replace(t, '\.{2,}', '.', 'g');
  return t;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_dm_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_dev boolean := false;
begin
  if NEW.content is null or btrim(NEW.content) = '' then return NEW; end if;
  if to_regprocedure('public.is_dev()') is not null then
    begin v_dev := public.is_dev(); exception when others then v_dev := false; end;
  end if;
  if v_dev then return NEW; end if;
  if public.dz_has_link(NEW.content) then
    raise exception 'dm_no_links' using errcode='P0001';
  end if;
  if public.dz_phish_score(NEW.content) >= 2 then
    perform public.dz_log_abuse('direct_messages','phish','content',NEW.content);
    return null;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_download_limit(p_tier text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT CASE lower(coalesce(p_tier, 'guest'))
    WHEN 'dev'     THEN 100000
    WHEN 'max'     THEN 20
    WHEN 'premium' THEN 15
    WHEN 'lite'    THEN 10
    ELSE 5
  END;
$function$;

CREATE OR REPLACE FUNCTION public.dz_download_quota() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_tier  text;
  v_limit int;
  v_used  int;
  v_day   timestamptz := date_trunc('day', now());
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('signed_in', false);
  END IF;
  IF NOT public.dz_rate_ok('dq:u:' || v_uid::text, 120, 60) THEN
    RETURN jsonb_build_object('signed_in', true, 'reason', 'rate');
  END IF;
  v_tier  := COALESCE(public.dz_effective_tier(v_uid), 'guest');
  v_limit := public.dz_download_limit(v_tier);
  SELECT count(*) INTO v_used FROM public.download_events
   WHERE viewer_key = 'u:' || v_uid::text
     AND created_at >= v_day;
  RETURN jsonb_build_object('signed_in', true, 'tier', v_tier,
                            'limit', v_limit, 'used', v_used,
                            'remaining', greatest(v_limit - v_used, 0),
                            'resets_at', v_day + interval '1 day');
END $function$;

CREATE OR REPLACE FUNCTION public.dz_earning_apply_deductions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  cfg        public.platform_tax_config%rowtype;
  v_tax      record;
  v_win      record;
  v_scope    text;
  v_rate     numeric(18,8);
  v_scale    integer;
  v_country  text;
  v_pan      text;
  v_indiv    boolean;
  v_fy_gross bigint;
  v_after_gw bigint;
begin
  select * into cfg from public.platform_tax_config where id = 1;
  if not found then raise exception 'platform_tax_config is missing'; end if;

  v_scale := case when new.currency in ('JPY', 'HUF', 'TWD') then 100 else 1 end;

  new.gateway_fee := greatest(coalesce(new.gateway_fee, 0), 0);
  v_after_gw      := new.gross_amount - new.gateway_fee;
  if v_after_gw < 0 then raise exception 'gateway fee exceeds the sale'; end if;

  new.fee_bps := coalesce(
    nullif(new.fee_bps, 0),
    case when public.dz_effective_tier(new.seller_id) = 'max'
         then cfg.max_commission_bps
         else cfg.commission_bps end);
  new.fee_amount := round(new.gross_amount::numeric * new.fee_bps / 10000);

  select country, pan, is_individual into v_tax
    from public.seller_tax where user_id = new.seller_id;
  v_country := coalesce(v_tax.country, 'IN');
  v_pan     := v_tax.pan;
  v_indiv   := coalesce(v_tax.is_individual, true);

  if v_country <> 'IN' then
    new.tds_bps := 0;
  elsif v_pan is null or v_pan = '' then
    new.tds_bps := cfg.tds_no_pan_bps;
  elsif v_indiv then
    v_fy_gross := public.dz_fy_gross(new.seller_id);
    new.tds_bps := case when v_fy_gross <= cfg.tds_floor_inr then 0 else cfg.tds_bps end;
  else
    new.tds_bps := cfg.tds_bps;
  end if;
  new.tds_amount := round(new.gross_amount::numeric * new.tds_bps / 10000);

  if cfg.tcs_active and v_country = 'IN' then
    new.tcs_bps    := cfg.tcs_bps;
    new.tcs_amount := round(new.gross_amount::numeric * cfg.tcs_bps / 10000);
  else
    new.tcs_bps    := 0;
    new.tcs_amount := 0;
  end if;

  new.net_amount := v_after_gw - new.fee_amount - new.tds_amount - new.tcs_amount;
  if new.net_amount < 0 then
    new.fee_amount := greatest(v_after_gw - new.tds_amount - new.tcs_amount, 0);
    new.net_amount := v_after_gw - new.fee_amount - new.tds_amount - new.tcs_amount;
  end if;
  if new.net_amount < 0 then raise exception 'deductions exceed the sale value'; end if;

  v_scope := case
    when new.provider = 'razorpay' and new.currency = 'INR' then 'domestic'
    when new.provider = 'razorpay' then 'international'
    else 'any' end;

  select * into v_win from public.settlement_windows
   where provider = coalesce(new.provider, 'paypal') and scope = v_scope;
  if not found then
    select * into v_win from public.settlement_windows
     where provider = coalesce(new.provider, 'paypal') and scope = 'any';
  end if;

  if found then
    new.available_at := case when v_win.business
      then public.dz_add_business_days(now(), v_win.days)
      else now() + (v_win.days || ' days')::interval end;
    new.settlement_note := v_win.label;
  else
    new.available_at := public.dz_add_business_days(now(), 7);
    new.settlement_note := 'Settling';
  end if;

  select inr_rate into v_rate from public.fx_rates where code = new.currency;
  if v_rate is not null then
    new.fx_inr_rate := v_rate;
    new.fee_inr     := round(new.fee_amount * v_rate * v_scale);
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_effective_tier(p_user uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT CASE
    WHEN p.subscription_expires_at IS NOT NULL
     AND p.subscription_expires_at < now() THEN 'guest'
    ELSE COALESCE(p.subscription_tier, 'guest')
  END
  FROM public.profiles p WHERE p.id = p_user;
$function$;

CREATE OR REPLACE FUNCTION public.dz_email_key(p_email text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp' AS $function$
declare v_key text; v_norm text := lower(btrim(coalesce(p_email,'')));
begin
  if v_norm = '' then return null; end if;
  select value into v_key from public.dz_secrets where name='auth_attempt_key';
  if v_key is null then return null; end if;
  return left(encode(extensions.hmac(v_norm, v_key, 'sha256'),'hex'), 32);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_fill_comment_username() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  NEW.username := (SELECT COALESCE(display_name, username, 'artist')
                     FROM public.profiles WHERE id = NEW.user_id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.dz_fold_name(p_name text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
  select translate(regexp_replace(public.dz_deobfuscate(p_name), '[^a-z0-9]+', '', 'g'), '0134578', 'oieasrt');
$function$;

CREATE OR REPLACE FUNCTION public.dz_fy_gross(p_user uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select coalesce(sum(
           round(e.gross_amount * f.inr_rate *
                 case when e.currency in ('JPY', 'HUF', 'TWD') then 100 else 1 end)
         ), 0)::bigint
  from public.marketplace_earnings e
  join public.fx_rates f on f.code = e.currency
  where e.seller_id = p_user
    and e.status <> 'reversed'
    and e.created_at >= (
      make_timestamptz(
        case when extract(month from now()) >= 4
             then extract(year from now())::int
             else extract(year from now())::int - 1 end,
        4, 1, 0, 0, 0, 'UTC')
    );
$function$;

CREATE OR REPLACE FUNCTION public.dz_grant_partner(p_email text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id    uuid;
  v_role  text;
  v_name  text;
begin
  if not public.dz_is_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address';
  end if;

  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then
    raise exception 'No account is registered to that address';
  end if;

  select p.role, p.username into v_role, v_name
    from public.profiles p where p.id = v_id;

  if v_role in ('admin', 'dev') then
    raise exception 'That account is already staff';
  end if;
  if v_role = 'partner' then
    return jsonb_build_object('ok', true, 'changed', false,
                              'user_id', v_id, 'username', v_name);
  end if;

  update public.profiles
     set role = 'partner', partner_since = now()
   where id = v_id;

  insert into public.notifications (user_id, type, title, message)
  values (v_id, 'admin', 'You are now a DigiArtz partner',
          'Your Collab Hub is open: claim your free Max membership, create '
          'your promo code, and start earning on every sale it brings in.');

  perform public.dz_audit('grant_partner', v_id,
    jsonb_build_object('email', v_email));

  return jsonb_build_object('ok', true, 'changed', true,
                            'user_id', v_id, 'username', v_name);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_guard_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_hit text; v_dev boolean := false;
begin
  if to_regprocedure('public.is_dev()') is not null then
    begin v_dev := public.is_dev(); exception when others then v_dev := false; end;
  end if;
  if v_dev then return NEW; end if;
  if TG_OP = 'INSERT' or NEW.username is distinct from OLD.username then
    v_hit := public.dz_name_reserved(NEW.username);
    if v_hit is not null then
      raise exception 'That name is reserved — pick another.' using errcode='P0001';
    end if;
  end if;
  if to_jsonb(NEW) ? 'display_name'
     and (TG_OP = 'INSERT' or NEW.display_name is distinct from OLD.display_name) then
    v_hit := public.dz_name_reserved(NEW.display_name);
    if v_hit is not null then
      raise exception 'That display name is reserved — pick another.' using errcode='P0001';
    end if;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_has_link(p_text text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
declare t text := public.dz_deobfuscate(p_text);
begin
  if t = '' then return false; end if;
  if t ~ '\y(https?|ftps?|ws{1,2}s?|data|javascript|magnet|tel|mailto)\s*:' then return true; end if;
  if t ~ '\ywww\.[a-z0-9-]' then return true; end if;
  if t ~ ('\y[a-z0-9][a-z0-9-]{0,62}(\.[a-z0-9-]{1,63})*\.('
    ||'com|net|org|info|biz|online|site|shop|store|app|dev|link|live|club|'
    ||'fun|top|vip|pro|xyz|icu|cyou|monster|quest|rest|cfd|sbs|bond|'
    ||'io|co|in|me|gg|tv|ly|to|cc|ru|su|ua|by|kz|cn|hk|tk|ml|ga|cf|gq|'
    ||'uk|us|ca|au|de|fr|jp|br|es|it|nl|se|pl|tr|ir|pk|bd|lk|np|ph|id|vn|'
    ||'work|click|download|review|country|stream|gdn|racing|win|'
    ||'page|space|website|host|press|fund|cash|money|credit|loan|finance'
    ||')\y') then return true; end if;
  if t ~ '\y[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\y' then return true; end if;
  if t ~ '\y(\d{1,3}\.){3}\d{1,3}(:\d+)?(/|\y)' then return true; end if;
  return false;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_is_banned(p_user uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select exists (
    select 1 from public.user_bans
     where user_id = p_user
       and lifted_at is null
       and (expires_at is null or expires_at > now()));
$function$;

CREATE OR REPLACE FUNCTION public.dz_is_ordinary(p_user uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select coalesce(
    (select role is null or role = 'guest' from public.profiles where id = p_user),
    false);
$function$;

CREATE OR REPLACE FUNCTION public.dz_is_partner(p_user uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select coalesce(
    (select role = 'partner' from public.profiles where id = p_user),
    false);
$function$;

CREATE OR REPLACE FUNCTION public.dz_is_privileged() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = ''
      OR (current_setting('request.jwt.claims', true))::jsonb->>'role' = 'service_role'
      OR public.is_dev();
$function$;

CREATE OR REPLACE FUNCTION public.dz_is_staff(p_user uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select coalesce(
    (select role in ('admin', 'dev') from public.profiles where id = p_user),
    false);
$function$;

CREATE OR REPLACE FUNCTION public.dz_job_allowance(p_tier text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
  select case lower(coalesce(p_tier, ''))
           when 'premium' then 1
           when 'max'     then 2
           else 0
         end
$function$;

CREATE OR REPLACE FUNCTION public.dz_job_plan(p_user uuid) RETURNS TABLE(tier text, allowance integer, period_start timestamp with time zone, period_end timestamp with time zone) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select q.tier,
         public.dz_job_allowance(q.tier),
         q.p_start,
         q.p_start + interval '31 days'
    from (
      select case when p.subscription_expires_at is null
                   or p.subscription_expires_at <= now()
                  then null
                  else p.subscription_tier
             end as tier,
             case when p.subscription_expires_at is null
                   or p.subscription_expires_at <= now()
                  then null
                  else p.subscription_expires_at
                       - (ceil(extract(epoch from (p.subscription_expires_at - now()))
                               / 2678400.0)::double precision * interval '31 days')
             end as p_start
        from (select p_user as uid) s
        left join public.profiles p on p.id = s.uid
    ) q
$function$;

CREATE OR REPLACE FUNCTION public.dz_job_post_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_uid   uuid;
  v_plan  record;
  v_used  integer;
  v_staff boolean := false;
begin
  if TG_TABLE_NAME = 'scheduled_sections' then
    if coalesce(new.section, '') <> 'jobs' then
      return new;
    end if;
  end if;

  v_uid := coalesce(auth.uid(), new.user_id);
  if v_uid is null then return new; end if;

  begin
    v_staff := public.dz_is_staff(v_uid);
  exception when others then
    v_staff := false;
  end;
  if v_staff then return new; end if;

  select * into v_plan from public.dz_job_plan(v_uid);

  if v_plan.tier is null or coalesce(v_plan.allowance, 0) = 0 then
    raise exception
      'Posting a job needs a Premium or Max subscription'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('dz_job_quota:' || v_uid::text));

  select count(*) into v_used from public.jobs
   where user_id = v_uid and created_at >= v_plan.period_start;

  if TG_TABLE_NAME = 'scheduled_sections' then
    select v_used + count(*) into v_used from public.scheduled_sections
     where user_id = v_uid and section = 'jobs' and publish_error is null;
  end if;

  if v_used >= v_plan.allowance then
    raise exception
      'You have used all % job % on your % plan this month',
      v_plan.allowance,
      case when v_plan.allowance = 1 then 'posting' else 'postings' end,
      initcap(v_plan.tier)
      using errcode = 'P0001';
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_job_quota() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_uid   uuid := auth.uid();
  v_plan  record;
  v_used  integer := 0;
  v_staff boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('tier', null, 'limit', 0, 'used', 0,
                              'remaining', 0, 'allowed', false, 'reason', 'auth');
  end if;

  begin
    v_staff := public.dz_is_staff(v_uid);
  exception when others then
    v_staff := false;
  end;

  select * into v_plan from public.dz_job_plan(v_uid);

  if v_staff then
    return jsonb_build_object('tier', coalesce(v_plan.tier, 'staff'),
                              'limit', null, 'used', 0, 'remaining', null,
                              'allowed', true, 'staff', true);
  end if;

  if v_plan.tier is null or coalesce(v_plan.allowance, 0) = 0 then
    return jsonb_build_object('tier', v_plan.tier, 'limit', 0, 'used', 0,
                              'remaining', 0, 'allowed', false, 'reason', 'plan');
  end if;

  select count(*) into v_used
    from (
      select 1 from public.jobs
       where user_id = v_uid and created_at >= v_plan.period_start
      union all
      select 1 from public.scheduled_sections
       where user_id = v_uid and section = 'jobs' and publish_error is null
    ) q;

  return jsonb_build_object(
    'tier',         v_plan.tier,
    'limit',        v_plan.allowance,
    'used',         v_used,
    'remaining',    greatest(v_plan.allowance - v_used, 0),
    'allowed',      v_used < v_plan.allowance,
    'reason',       case when v_used < v_plan.allowance then null else 'limit' end,
    'period_start', v_plan.period_start,
    'period_end',   v_plan.period_end);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_ledger_append(p_user uuid, p_type text, p_direction text, p_amount bigint, p_currency text, p_source text DEFAULT NULL::text, p_provider_txn text DEFAULT NULL::text, p_provider_amount bigint DEFAULT NULL::bigint, p_provider_currency text DEFAULT NULL::text, p_ref_table text DEFAULT NULL::text, p_ref_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_prev text; v_hash text; v_seq bigint;
begin
  select entry_hash into v_prev from public.ledger_entries order by seq desc limit 1;

  v_hash := encode(sha256(convert_to(
      coalesce(v_prev,'genesis') || '|' || p_user::text || '|' || p_type || '|' ||
      p_direction || '|' || p_amount::text || '|' || p_currency || '|' ||
      coalesce(p_provider_txn,'') || '|' || coalesce(p_provider_amount::text,''),
      'UTF8')), 'hex');

  insert into public.ledger_entries (
    user_id, entry_type, direction, amount, currency,
    source, provider_txn_id, provider_amount, provider_currency,
    ref_table, ref_id, note, prev_hash, entry_hash)
  values (p_user, p_type, p_direction, p_amount, p_currency,
    p_source, p_provider_txn, p_provider_amount, p_provider_currency,
    p_ref_table, p_ref_id, p_note, v_prev, v_hash)
  returning seq into v_seq;

  return v_seq;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_ledger_chain_ok() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare r record; v_prev text := null; v_calc text;
begin
  for r in select * from public.ledger_entries order by seq loop
    v_calc := encode(sha256(convert_to(
        coalesce(v_prev,'genesis') || '|' || r.user_id::text || '|' || r.entry_type || '|' ||
        r.direction || '|' || r.amount::text || '|' || r.currency || '|' ||
        coalesce(r.provider_txn_id,'') || '|' || coalesce(r.provider_amount::text,''),
        'UTF8')), 'hex');
    if v_calc <> r.entry_hash then
      return r.seq;
    end if;
    v_prev := r.entry_hash;
  end loop;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
begin
  raise exception 'ledger_entries is append-only: % is not permitted', tg_op;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_log_abuse(p_surface text, p_rule text, p_detail text, p_sample text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  insert into public.dz_abuse_events (user_id, ip, surface, rule, detail, sample)
  values (auth.uid(),
          case when to_regprocedure('public.dz_client_ip()') is not null then public.dz_client_ip() else null end,
          p_surface, p_rule, left(coalesce(p_detail,''),200), left(coalesce(p_sample,''),500));
exception when others then return;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_market_download(p_item uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v record;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select id, user_id, file_url, status into v
    from public.marketplace_items where id = p_item;
  if v.id is null or (v.status <> 'approved' and v.user_id <> auth.uid()) then
    raise exception 'Listing not found';
  end if;
  if v.file_url is null then
    raise exception 'This listing has no downloadable file';
  end if;

  if not public.dz_market_owns(p_item) then
    raise exception 'Purchase required';
  end if;

  return v.file_url;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_market_file_grant(p_item uuid, p_file uuid) RETURNS TABLE(bucket text, path text, filename text, mime text, legacy_url text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_market_owns(p_item) then
    raise exception 'Purchase required';
  end if;

  if p_file = p_item then
    return query
      select coalesce(
               (select o.bucket_id::text
                  from storage.objects o
                 where o.name = i.file_storage_path
                   and o.bucket_id in ('koe-originals', 'koe-media')
                 order by (o.bucket_id = 'koe-originals') desc
                 limit 1),
               'koe-media'),
             i.file_storage_path::text,
             coalesce(i.file_name, i.title, 'file')::text,
             null::text,
             i.file_url::text
        from public.marketplace_items i
       where i.id = p_item;
    return;
  end if;

  return query
    select f.storage_bucket::text,
           f.storage_path::text,
           coalesce(f.original_filename, 'file')::text,
           f.mime::text,
           null::text
      from public.marketplace_file f
     where f.id = p_file
       and f.item_id = p_item;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_market_files(p_item uuid) RETURNS TABLE(file_id uuid, name text, ext text, bytes bigint, ordinal smallint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_market_owns(p_item) then
    raise exception 'Purchase required';
  end if;

  return query
    select f.id,
           coalesce(f.original_filename, 'file')::text,
           (case when coalesce(f.original_filename, '') ~ '\.[A-Za-z0-9]{1,12}$'
                 then lower(regexp_replace(f.original_filename, '^.*\.', ''))
                 else 'file' end)::text,
           coalesce(f.bytes, 0)::bigint,
           f.position
      from public.marketplace_file f
     where f.item_id = p_item
     order by f.position, f.created_at;

  if found then
    return;
  end if;

  return query
    select i.id,
           coalesce(i.file_name, i.title, 'file')::text,
           lower(coalesce(nullif(i.file_ext, ''), 'file'))::text,
           coalesce(i.file_size, 0)::bigint,
           0::smallint
      from public.marketplace_items i
     where i.id = p_item
       and (i.file_storage_path is not null or i.file_url is not null);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_market_owned(p_items uuid[]) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select i.id
    from public.marketplace_items i
   where i.id = any(coalesce(p_items, '{}'::uuid[]))
     and public.dz_market_owns(i.id);
$function$;

CREATE OR REPLACE FUNCTION public.dz_market_owns(p_item uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select auth.uid() is not null and exists (
    select 1
      from public.marketplace_items i
     where i.id = p_item
       and (
         i.user_id = auth.uid()
         or (coalesce(i.price_cents, 0) = 0
             and i.status = 'approved'
             and i.visibility = 'published')
         or exists (
           select 1 from public.payments p
            where p.item_id = i.id
              and p.user_id = auth.uid()
              and p.kind    = 'marketplace'
              and p.status  = 'paid'
         )
       )
  );
$function$;

CREATE OR REPLACE FUNCTION public.dz_may_moderate(p_actor uuid, p_target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select case
    when p_actor is null or p_target is null then false
    when p_actor = p_target                  then false
    when public.dz_is_staff(p_actor)         then not public.dz_is_staff(p_target)
    when public.dz_is_partner(p_actor)       then public.dz_is_ordinary(p_target)
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION public.dz_mod_find(p_query text) RETURNS TABLE(id uuid, username text, display_name text, email text, role text, tier text, banned boolean, ban_reason text, ban_expires_at timestamp with time zone, can_moderate boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_q     text := btrim(coalesce(p_query, ''));
  v_id    uuid;
  v_staff boolean := public.dz_is_staff(auth.uid());
begin
  if not (v_staff or public.dz_is_partner(auth.uid())) then
    raise exception 'not allowed';
  end if;
  if char_length(v_q) < 2 then
    raise exception 'search for a username, an email or a user id';
  end if;

  begin
    v_id := v_q::uuid;
  exception when others then
    v_id := null;
  end;
  v_q := ltrim(v_q, '@');

  return query
  select p.id,
         p.username,
         p.display_name,
         case when v_staff then u.email::text else null end,
         case when v_staff then p.role else null end,
         coalesce(public.dz_effective_tier(p.id), 'guest') as tier,
         public.dz_is_banned(p.id) as banned,
         b.reason,
         b.expires_at,
         public.dz_may_moderate(auth.uid(), p.id) as can_moderate
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.user_bans b on b.user_id = p.id and b.lifted_at is null
   where (v_id is not null and p.id = v_id)
      or lower(p.username) = lower(v_q)
      or lower(u.email)    = lower(v_q)
   limit 1;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_mod_token_clear() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    NEW.mod_token := null;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_my_collab_state() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select coalesce(
    (select jsonb_build_object(
       'role', p.role,
       'is_partner', p.role = 'partner',
       'is_staff', p.role in ('admin', 'dev'),
       'max_claimed', p.max_claimed,
       'tier', coalesce(public.dz_effective_tier(p.id), 'guest'),
       'has_promo', exists (
         select 1 from public.promo_codes pc where pc.partner_id = p.id),
       'has_payout_method', exists (
         select 1 from public.payout_methods pm where pm.user_id = p.id))
     from public.profiles p where p.id = auth.uid()),
    jsonb_build_object(
      'role', null, 'is_partner', false, 'is_staff', false,
      'max_claimed', false, 'tier', 'guest',
      'has_promo', false, 'has_payout_method', false));
$function$;

CREATE OR REPLACE FUNCTION public.dz_my_purchases() RETURNS TABLE(payment_id uuid, item_id uuid, title text, preview_url text, item_type text, license text, seller_id uuid, seller_name text, amount bigint, currency text, paid_at timestamp with time zone, provider text, file_count integer, delisted boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select p.id,
         p.item_id,
         coalesce(i.title, p.order_label, 'Marketplace item')::text,
         i.preview_url::text,
         i.item_type::text,
         i.license::text,
         i.user_id,
         pr.username::text,
         p.amount,
         p.currency::text,
         coalesce(p.paid_at, p.created_at),
         p.provider::text,
         (case
            when (select count(*) from public.marketplace_file f where f.item_id = i.id) > 0
              then (select count(*) from public.marketplace_file f where f.item_id = i.id)
            when i.file_storage_path is not null or i.file_url is not null then 1
            else 0
          end)::integer,
         (i.id is null)
    from public.payments p
    left join public.marketplace_items i on i.id = p.item_id
    left join public.profiles pr         on pr.id = i.user_id
   where p.user_id = auth.uid()
     and p.kind    = 'marketplace'
     and p.status  = 'paid'
   order by coalesce(p.paid_at, p.created_at) desc;
$function$;

CREATE OR REPLACE FUNCTION public.dz_name_reserved(p_name text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_folded text := public.dz_fold_name(p_name); v_hit text;
begin
  if v_folded is null or v_folded = '' then return null; end if;
  select r.name into v_hit from public.reserved_names r
   where (r.mode='exact' and v_folded = r.name)
      or (r.mode='contains' and position(r.name in v_folded) > 0)
   order by length(r.name) desc limit 1;
  return v_hit;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_note_auth(p_event text, p_email text DEFAULT NULL::text, p_ok boolean DEFAULT NULL::boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_ip text;
begin
  if p_event is null or p_event not in ('login','signup','logout','recover') then return; end if;
  if to_regprocedure('public.dz_client_ip()') is not null then
    begin v_ip := public.dz_client_ip(); exception when others then v_ip := null; end;
  end if;
  if v_ip is null or v_ip = '' then return; end if;
  if not public.dz_rate_ok('authnote:'||v_ip, 60, 3600) then return; end if;
  insert into public.auth_attempts (ip, email_key, event, ok)
  values (v_ip, public.dz_email_key(p_email), p_event, p_ok);
  if random() < 0.01 then delete from public.auth_attempts where created_at < now() - interval '1 day'; end if;
exception when others then return;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_partner_credit_market() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  cfg     public.platform_tax_config%rowtype;
  v_part  uuid;
  v_amt   bigint;
  v_rate  numeric(18,8);
  v_scale integer;
begin
  if new.promo_code_id is null then return new; end if;

  select partner_id into v_part from public.promo_codes
   where id = new.promo_code_id and is_active;
  if v_part is null then return new; end if;
  if not public.dz_is_partner(v_part) then return new; end if;
  if v_part = new.seller_id or v_part = new.buyer_id then return new; end if;

  select * into cfg from public.platform_tax_config where id = 1;
  v_amt := round(new.gross_amount::numeric * cfg.partner_market_bps / 10000);

  v_amt := least(v_amt, new.fee_amount);
  if v_amt <= 0 then return new; end if;

  v_scale := case when new.currency in ('JPY', 'HUF', 'TWD') then 100 else 1 end;
  select inr_rate into v_rate from public.fx_rates where code = new.currency;

  insert into public.partner_commissions (
    partner_id, promo_code_id, buyer_id, kind, earning_id, label,
    gross_amount, rate_bps, amount, currency, amount_inr, fx_inr_rate)
  values (
    v_part, new.promo_code_id, new.buyer_id, 'marketplace', new.id,
    'Marketplace sale',
    new.gross_amount, cfg.partner_market_bps, v_amt, new.currency,
    case when v_rate is null then null else round(v_amt * v_rate * v_scale) end,
    v_rate)
  on conflict (earning_id) where earning_id is not null do nothing;

  if found then
    update public.promo_codes
       set usage_count = usage_count + 1
     where id = new.promo_code_id;
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_partner_credit_sub() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  cfg     public.platform_tax_config%rowtype;
  v_part  uuid;
  v_list  bigint;
  v_amt   bigint;
  v_rate  numeric(18,8);
  v_scale integer;
begin
  if new.status <> 'paid' or new.kind <> 'subscription' then return new; end if;
  if new.promo_code_id is null then return new; end if;

  select partner_id into v_part from public.promo_codes
   where id = new.promo_code_id and is_active;
  if v_part is null then return new; end if;
  if not public.dz_is_partner(v_part) then return new; end if;
  if v_part = new.user_id then return new; end if;

  select * into cfg from public.platform_tax_config where id = 1;

  if cfg.promo_sub_discount_bps >= 10000 then return new; end if;
  v_list := round(new.amount::numeric * 10000 / (10000 - cfg.promo_sub_discount_bps));
  v_amt  := round(v_list::numeric * cfg.partner_sub_bps / 10000);

  v_amt := least(v_amt, new.amount);
  if v_amt <= 0 then return new; end if;

  v_scale := case when new.currency in ('JPY', 'HUF', 'TWD') then 100 else 1 end;
  select inr_rate into v_rate from public.fx_rates where code = new.currency;

  insert into public.partner_commissions (
    partner_id, promo_code_id, buyer_id, kind, payment_id, label,
    gross_amount, rate_bps, amount, currency, amount_inr, fx_inr_rate)
  values (
    v_part, new.promo_code_id, new.user_id, 'subscription', new.id,
    'Max subscription',
    v_list, cfg.partner_sub_bps, v_amt, new.currency,
    case when v_rate is null then null else round(v_amt * v_rate * v_scale) end,
    v_rate)
  on conflict (payment_id) where payment_id is not null do nothing;

  if found then
    update public.promo_codes
       set usage_count = usage_count + 1
     where id = new.promo_code_id;
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_partner_ledger(p_limit integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(id uuid, created_at timestamp with time zone, kind text, label text, buyer_username text, gross_amount bigint, rate_bps integer, amount bigint, currency text, payout_status text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_is_partner(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  select c.id, c.created_at, c.kind, c.label,
         b.username, c.gross_amount, c.rate_bps, c.amount, c.currency,
         c.payout_status
    from public.partner_commissions c
    left join public.profiles b on b.id = c.buyer_id
   where c.partner_id = auth.uid()
     and (p_before is null or c.created_at < p_before)
   order by c.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_partner_reverse() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_rows integer;
begin
  update public.partner_commissions
     set payout_status = 'reversed'
   where payout_status = 'wallet_credited'
     and (   (tg_table_name = 'marketplace_earnings' and earning_id = new.id)
          or (tg_table_name = 'payments'             and payment_id = new.id));
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update public.promo_codes c
       set usage_count = greatest(c.usage_count - v_rows, 0)
     where c.id = new.promo_code_id;
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_partner_wallet() RETURNS TABLE(currency text, available bigint, lifetime bigint, paid_out bigint, conversions bigint, has_payout_method boolean, route text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_has boolean;
begin
  if not public.dz_is_partner(auth.uid()) then
    raise exception 'not allowed';
  end if;

  select exists (select 1 from public.payout_methods where user_id = auth.uid())
    into v_has;

  return query
  select c.currency,
         coalesce(sum(c.amount) filter (where c.payout_status = 'wallet_credited'), 0)::bigint,
         coalesce(sum(c.amount) filter (where c.payout_status <> 'reversed'), 0)::bigint,
         coalesce(sum(c.amount) filter (where c.payout_status = 'paid_direct'), 0)::bigint,
         count(*) filter (where c.payout_status <> 'reversed')::bigint,
         v_has,
         case when v_has then 'direct' else 'wallet' end
    from public.partner_commissions c
   where c.partner_id = auth.uid()
   group by c.currency
   order by c.currency;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_phish_score(p_text text) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $function$
declare
  t text := regexp_replace(public.dz_deobfuscate(p_text), '[^a-z0-9@:/. ]+', ' ', 'g');
  n int := 0; pat text;
  fatal text[] := array['this message was generated automatically','generated automatically and sent from',
    'complete verification','seed phrase','recovery phrase','private key','wallet address',
    'connect your wallet','validate your wallet','send.{0,12}(btc|eth|usdt|bnb|sol)',
    'copy and paste it into your browser','copy.{0,12}paste.{0,12}(link|url).{0,20}browser'];
  weak text[] := array['account (has been|is|was) (temporarily )?(restricted|suspended|limited|locked|disabled)',
    'under review until','verify your (account|identity|information)','verification (process|page|link|required)',
    'regain (full )?access','secure link','support (representative|agent|team) will','official support',
    'updated our privacy policy','in accordance with the new privacy policy','failure to (verify|comply)',
    'within 24 hours','permanently (deleted|removed|banned)','click (the|this) link','if you can.?t click',
    'claim your (reward|prize|airdrop|nft|gift)','you have been selected','limited time offer',
    'confirm your (payment|billing|card)'];
begin
  if t = '' then return 0; end if;
  foreach pat in array fatal loop if t ~ pat then return 10; end if; end loop;
  foreach pat in array weak loop
    if t ~ pat then n := n + 1; end if;
    exit when n >= 2;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_platform_revenue() RETURNS TABLE(commission_inr bigint, subscriptions_inr bigint, partner_inr bigint, total_inr bigint, tds_held_inr bigint, tcs_held_inr bigint, held_for_sellers json) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_is_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;
  return query
  with com as (
    select coalesce(sum(fee_inr), 0)::bigint as amt
    from public.marketplace_earnings where status <> 'reversed'
  ),
  stat as (
    select
      coalesce(sum(round(e.tds_amount * f.inr_rate *
        case when e.currency in ('JPY','HUF','TWD') then 100 else 1 end)), 0)::bigint as tds,
      coalesce(sum(round(e.tcs_amount * f.inr_rate *
        case when e.currency in ('JPY','HUF','TWD') then 100 else 1 end)), 0)::bigint as tcs
    from public.marketplace_earnings e
    join public.fx_rates f on f.code = e.currency
    where e.status <> 'reversed'
  ),
  sub as (
    select coalesce(sum(round(p.amount * f.inr_rate *
             case when p.currency in ('JPY','HUF','TWD') then 100 else 1 end)), 0)::bigint as amt
    from public.payments p
    join public.fx_rates f on f.code = p.currency
    where p.kind = 'subscription' and p.status = 'paid'
  ),
  prt as (
    select coalesce(sum(c.amount_inr), 0)::bigint as amt
    from public.partner_commissions c
    where c.payout_status <> 'reversed'
  ),
  held as (
    select coalesce(json_object_agg(currency, amt), '{}'::json) as js
    from (
      select currency, sum(net_amount)::bigint as amt
      from public.marketplace_earnings
      where status in ('pending', 'available')
      group by currency
    ) x
  )
  select com.amt, sub.amt, prt.amt,
         (com.amt + sub.amt - prt.amt)::bigint,
         stat.tds, stat.tcs, held.js
  from com, sub, stat, prt, held;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_profiles_guard_insert() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role is not null or new.max_claimed or new.partner_since is not null then
      raise exception 'role, max_claimed and partner_since are not yours to set';
    end if;
    if new.subscription_tier is distinct from 'guest'
       or new.subscription_expires_at is not null then
      raise exception 'subscription_tier and subscription_expires_at are not yours to set';
    end if;
    if new.merit is distinct from 100
       or new.cred_received_count is distinct from 0 then
      raise exception 'merit and cred_received_count are not yours to set';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_profiles_guard_privileged() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if (new.role          is distinct from old.role)
  or (new.max_claimed   is distinct from old.max_claimed)
  or (new.partner_since is distinct from old.partner_since) then
    if current_user in ('authenticated', 'anon') then
      raise exception 'role, max_claimed and partner_since are not yours to set';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_promo_create(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_id   uuid;
  v_bad  boolean := false;
begin
  if not public.dz_is_partner(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if v_code !~ '^[A-Z0-9]{4,6}$' then
    raise exception 'A code is 4 to 6 letters or digits, nothing else';
  end if;
  if exists (select 1 from public.promo_codes where partner_id = auth.uid()) then
    raise exception 'You already have a code';
  end if;
  if exists (select 1 from public.promo_codes where code = v_code) then
    raise exception 'That code is taken';
  end if;

  begin
    select exists (
      select 1 from public.bad_words w
       where v_code = upper(w.word) or v_code like '%' || upper(w.word) || '%'
    ) into v_bad;
  exception when undefined_table then
    v_bad := false;
  end;
  if v_bad then
    raise exception 'Pick a different code';
  end if;

  insert into public.promo_codes (code, partner_id)
  values (v_code, auth.uid())
  returning id into v_id;

  perform public.dz_audit('create_promo', auth.uid(),
    jsonb_build_object('promo_id', v_id, 'code', v_code));

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_promo_mine() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  r      record;
  v_conv record;
begin
  if not public.dz_is_partner(auth.uid()) then
    raise exception 'not allowed';
  end if;

  select c.id, c.code, c.is_active, c.usage_count, c.created_at into r
    from public.promo_codes c where c.partner_id = auth.uid();

  if not found then
    return jsonb_build_object('ok', true, 'code', null);
  end if;

  select
    count(*) filter (where kind = 'marketplace')  as market,
    count(*) filter (where kind = 'subscription') as subs,
    count(distinct buyer_id)                     as buyers
    into v_conv
    from public.partner_commissions
   where partner_id = auth.uid() and payout_status <> 'reversed';

  return jsonb_build_object(
    'ok', true,
    'id', r.id, 'code', r.code, 'is_active', r.is_active,
    'usage_count', r.usage_count, 'created_at', r.created_at,
    'marketplace_conversions', coalesce(v_conv.market, 0),
    'subscription_conversions', coalesce(v_conv.subs, 0),
    'unique_buyers', coalesce(v_conv.buyers, 0));
end $function$;

CREATE OR REPLACE FUNCTION public.dz_promo_resolve(p_code text, p_kind text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  r      record;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  if p_kind not in ('marketplace', 'subscription') then
    raise exception 'unknown purchase kind';
  end if;
  if v_code !~ '^[A-Z0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'error', 'That code does not look right');
  end if;

  select c.id, c.partner_id, c.is_active into r
    from public.promo_codes c where c.code = v_code;

  if not found or not r.is_active then
    return jsonb_build_object('ok', false, 'error', 'No such code');
  end if;
  if not public.dz_is_partner(r.partner_id) then
    return jsonb_build_object('ok', false, 'error', 'No such code');
  end if;
  if r.partner_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'You cannot use your own code');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', r.id,
    'code', v_code,
    'discount_bps', case when p_kind = 'subscription' then 9000 else 0 end);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_protect_item_view_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if coalesce(current_setting('app.allow_view_count_write', true), '') <> '1' then
    if TG_OP = 'INSERT' then NEW.view_count := 0; else NEW.view_count := OLD.view_count; end if;
  elsif TG_OP = 'UPDATE' then
    NEW.updated_at := OLD.updated_at;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_protect_social_counters() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if TG_TABLE_NAME = 'marketplace_items' then
    if TG_OP = 'INSERT' then
      new.like_count := 0; new.sales_count := 0;
    else
      new.like_count := old.like_count; new.sales_count := old.sales_count;
    end if;

  elsif TG_TABLE_NAME = 'resources' then
    if TG_OP = 'INSERT' then
      new.like_count := 0; new.download_count := 0;
    else
      new.like_count := old.like_count; new.download_count := old.download_count;
    end if;

  elsif TG_TABLE_NAME = 'blog_posts' then
    if TG_OP = 'INSERT' then
      new.like_count := 0; new.bookmark_count := 0;
    else
      new.like_count := old.like_count; new.bookmark_count := old.bookmark_count;
    end if;
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_range_on_change() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
declare
  i int; col text; lo bigint; hi bigint; nullable boolean;
  newv numeric; oldv numeric;
begin
  i := 0;
  while i < TG_NARGS loop
    col := TG_ARGV[i]; lo := TG_ARGV[i+1]::bigint; hi := TG_ARGV[i+2]::bigint;
    nullable := TG_ARGV[i+3] = 'null-ok';

    execute format('select ($1).%I::numeric', col) into newv using NEW;
    if TG_OP = 'UPDATE' then
      execute format('select ($1).%I::numeric', col) into oldv using OLD;
    else oldv := null; end if;

    if TG_OP = 'INSERT' or newv is distinct from oldv then
      if newv is null then
        if not nullable then raise exception '% is required', col using errcode = '23514'; end if;
      elsif newv < lo or newv > hi then
        raise exception '% must be between % and %', col, lo, hi using errcode = '23514';
      end if;
    end if;
    i := i + 4;
  end loop;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_rate_ok(p_bucket text, p_max integer, p_window_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_start timestamptz;
  v_hits  int;
BEGIN
  IF p_bucket IS NULL OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN true;
  END IF;
  v_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_hits (bucket, window_start, hits)
  VALUES (left(p_bucket, 200), v_start, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = public.rate_hits.hits + 1
  RETURNING hits INTO v_hits;

  IF random() < 0.005 THEN
    DELETE FROM public.rate_hits WHERE window_start < now() - interval '1 hour';
  END IF;

  RETURN v_hits <= p_max;
END $function$;

CREATE OR REPLACE FUNCTION public.dz_rate_take(p_bucket text, p_limit integer, p_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_start timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_seconds) * p_seconds);
  v_hits integer;
begin
  insert into public.rate_hits (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start)
    do update set hits = public.rate_hits.hits + 1
  returning hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_hits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_read_guard(p_name text, p_max integer, p_win integer) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_key text := public.dz_actor_key();
begin
  if v_key is null then return; end if;
  if not public.dz_rate_ok('read:' || p_name || ':' || v_key, p_max, p_win) then
    raise exception 'Too many requests — slow down and try again' using errcode='P0001';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_reconcile(p_user uuid) RETURNS TABLE(currency text, operational bigint, ledger bigint, discrepancy bigint, agrees boolean) LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  with op as (
    select e.currency,
           coalesce(sum(e.net_amount), 0) as amt
    from public.marketplace_earnings e
    where e.seller_id = p_user
      and e.status in ('available','pending')
    group by e.currency
  ),
  led as (
    select l.currency,
           coalesce(sum(case when l.direction = 'credit' then l.amount
                             else -l.amount end), 0) as amt
    from public.ledger_entries l
    where l.user_id = p_user
    group by l.currency
  ),
  cur as (select currency from op union select currency from led)
  select c.currency,
         coalesce(op.amt,0)::bigint,
         coalesce(led.amt,0)::bigint,
         (coalesce(op.amt,0) - coalesce(led.amt,0))::bigint,
         (coalesce(op.amt,0) = coalesce(led.amt,0))
  from cur c
  left join op  on op.currency  = c.currency
  left join led on led.currency = c.currency;
$function$;

CREATE OR REPLACE FUNCTION public.dz_repeat_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_col text := coalesce(nullif(TG_ARGV[0],''),'body');
  v_limit int := coalesce(nullif(TG_ARGV[1],'')::int, 5);
  v_text text; v_row json := row_to_json(NEW); v_uid uuid := auth.uid();
  v_fp text; v_n int; v_dev boolean := false;
begin
  if v_uid is null then return NEW; end if;
  if to_regprocedure('public.is_dev()') is not null then
    begin v_dev := public.is_dev(); exception when others then v_dev := false; end;
  end if;
  if v_dev then return NEW; end if;
  v_text := v_row ->> v_col;
  v_fp := public.dz_content_fingerprint(v_text);
  if v_fp is null then return NEW; end if;
  insert into public.content_repeats (user_id, fingerprint) values (v_uid, v_fp)
  on conflict (user_id, fingerprint) do update
    set n = case when public.content_repeats.last_at < now() - interval '6 hours'
                 then 1 else public.content_repeats.n + 1 end,
        last_at = now()
  returning n into v_n;
  if v_n < v_limit then return NEW; end if;
  if not public.dz_is_banned(v_uid) then
    insert into public.user_bans (user_id, reason, note, banned_by, expires_at)
    values (v_uid, 'spam',
            'Automatic: the same message posted '||v_n||' times ('||TG_TABLE_NAME||'.'||v_col||')',
            null, now() + interval '1 day');
  end if;
  if to_regprocedure('public.dz_log_abuse(text,text,text,text)') is not null then
    perform public.dz_log_abuse(TG_TABLE_NAME,'repeat','n='||v_n||' auto-ban 1 day', v_text);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_report_resolve(p_id uuid, p_status text, p_note text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_target uuid;
begin
  if not (public.dz_is_staff(auth.uid()) or public.dz_is_partner(auth.uid())) then
    raise exception 'not allowed';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'unknown status';
  end if;

  update public.user_reports
     set status = p_status, resolved_by = auth.uid(), resolved_at = now(),
         resolution = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id and status = 'pending'
   returning target_id into v_target;

  if v_target is null then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  perform public.dz_audit('resolve_report', v_target,
    jsonb_build_object('report_id', p_id, 'status', p_status));
  return jsonb_build_object('ok', true, 'changed', true);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_reports_queue(p_status text DEFAULT 'pending'::text, p_limit integer DEFAULT 100) RETURNS TABLE(id uuid, reason text, details text, status text, created_at timestamp with time zone, target_id uuid, target_username text, target_banned boolean, reporter_id uuid, reporter_username text, resolved_by uuid, resolved_at timestamp with time zone, resolution text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_staff boolean := public.dz_is_staff(auth.uid());
begin
  if not (v_staff or public.dz_is_partner(auth.uid())) then
    raise exception 'not allowed';
  end if;
  if p_status not in ('pending', 'resolved', 'dismissed', 'all') then
    raise exception 'unknown status';
  end if;

  return query
  select r.id, r.reason, r.details, r.status, r.created_at,
         r.target_id, t.username, public.dz_is_banned(r.target_id),
         r.reporter_id, rp.username,
         r.resolved_by, r.resolved_at, r.resolution
    from public.user_reports r
    left join public.profiles t  on t.id  = r.target_id
    left join public.profiles rp on rp.id = r.reporter_id
   where (p_status = 'all' or r.status = p_status)
     and (v_staff or public.dz_may_moderate(auth.uid(), r.target_id))
   order by r.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_request_download(p_artwork uuid, p_ip text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_uid    uuid := auth.uid();
  v_key    text;
  v_tier   text;
  v_limit  int;
  v_used   int;
  v_full   boolean;
  v_owner  uuid;
  v_status text;
  v_day    timestamptz := date_trunc('day', now());
begin
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'auth');
  end if;

  if not public.dz_rate_ok('dl:u:' || v_uid::text, 30, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;
  if p_ip is not null and p_ip <> ''
     and not public.dz_rate_ok('dl:ip:' || left(p_ip, 64), 60, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;

  select user_id, status into v_owner, v_status
    from public.artworks where id = p_artwork;
  if v_owner is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  if v_owner = v_uid then
    return jsonb_build_object('allowed', true, 'full', true, 'own', true);
  end if;

  if v_status is distinct from 'approved' then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  v_key   := 'u:' || v_uid::text;
  v_tier  := coalesce(public.dz_effective_tier(v_uid), 'guest');
  v_limit := public.dz_download_limit(v_tier);
  v_full  := v_tier in ('premium', 'max', 'dev');

  perform pg_advisory_xact_lock(hashtext(v_key));

  select count(*) into v_used from public.download_events
   where viewer_key = v_key
     and created_at >= v_day;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'limit',
                              'limit', v_limit, 'used', v_used, 'remaining', 0,
                              'tier', v_tier, 'resets_at', v_day + interval '1 day');
  end if;

  insert into public.download_events (viewer_key, artwork_id)
  values (v_key, p_artwork);

  return jsonb_build_object('allowed', true, 'full', v_full,
                            'used', v_used + 1,
                            'remaining', v_limit - v_used - 1,
                            'limit', v_limit, 'tier', v_tier,
                            'resets_at', v_day + interval '1 day');
end $function$;

CREATE OR REPLACE FUNCTION public.dz_request_item_download(p_kind text, p_id uuid, p_ip text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_uid    uuid := auth.uid();
  v_key    text;
  v_tier   text;
  v_limit  int;
  v_used   int;
  v_owner  uuid;
  v_status text;
  v_vis    text;
  v_day    timestamptz := date_trunc('day', now());
begin
  if p_kind not in ('resource','blog') then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'auth');
  end if;

  if not public.dz_rate_ok('dl:u:' || v_uid::text, 30, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;
  if p_ip is not null and p_ip <> ''
     and not public.dz_rate_ok('dl:ip:' || left(p_ip, 64), 60, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;

  if p_kind = 'resource' then
    select user_id, status, visibility into v_owner, v_status, v_vis
      from public.resources where id = p_id;
  else
    select user_id, status, visibility into v_owner, v_status, v_vis
      from public.blog_posts where id = p_id;
  end if;

  if v_owner is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  if v_owner = v_uid then
    return jsonb_build_object('allowed', true, 'own', true);
  end if;

  if v_status is distinct from 'approved' or v_vis is distinct from 'published' then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  v_key   := 'u:' || v_uid::text;
  v_tier  := coalesce(public.dz_effective_tier(v_uid), 'guest');
  v_limit := public.dz_download_limit(v_tier);

  perform pg_advisory_xact_lock(hashtext(v_key));

  select count(*) into v_used from public.download_events
   where viewer_key = v_key
     and created_at >= v_day;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'limit',
                              'limit', v_limit, 'used', v_used, 'remaining', 0,
                              'tier', v_tier, 'resets_at', v_day + interval '1 day');
  end if;

  insert into public.download_events (viewer_key, kind, subject_id)
  values (v_key, p_kind, p_id);

  return jsonb_build_object('allowed', true,
                            'used', v_used + 1,
                            'remaining', v_limit - v_used - 1,
                            'limit', v_limit, 'tier', v_tier,
                            'resets_at', v_day + interval '1 day');
end $function$;

CREATE OR REPLACE FUNCTION public.dz_resource_file_grant(p_resource uuid, p_ip text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_uid    uuid := auth.uid();
  v_key    text;
  v_tier   text;
  v_limit  int;
  v_used   int;
  v_r      record;
  v_day    timestamptz := date_trunc('day', now());
  v_own    boolean;
begin
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'auth');
  end if;

  if not public.dz_rate_ok('dl:u:' || v_uid::text, 30, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;
  if p_ip is not null and p_ip <> ''
     and not public.dz_rate_ok('dl:ip:' || left(p_ip, 64), 60, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;

  select user_id, status, visibility, file_storage_bucket, file_storage_path,
         file_url, file_name, file_ext
    into v_r
    from public.resources where id = p_resource;

  if v_r.user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  v_own := v_r.user_id = v_uid;

  if not v_own and (v_r.status is distinct from 'approved'
                    or v_r.visibility is distinct from 'published') then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  if not v_own then
    v_key   := 'u:' || v_uid::text;
    v_tier  := coalesce(public.dz_effective_tier(v_uid), 'guest');
    v_limit := public.dz_download_limit(v_tier);

    perform pg_advisory_xact_lock(hashtext(v_key));

    select count(*) into v_used from public.download_events
     where viewer_key = v_key
       and created_at >= v_day;

    if v_used >= v_limit then
      return jsonb_build_object('allowed', false, 'reason', 'limit',
                                'limit', v_limit, 'used', v_used, 'remaining', 0,
                                'tier', v_tier, 'resets_at', v_day + interval '1 day');
    end if;

    insert into public.download_events (viewer_key, kind, subject_id)
    values (v_key, 'resource', p_resource);

    update public.resources
       set download_count = coalesce(download_count, 0) + 1
     where id = p_resource;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'own', v_own,
    'bucket', v_r.file_storage_bucket,
    'path',   v_r.file_storage_path,
    'legacy_url', v_r.file_url,
    'filename', coalesce(v_r.file_name, 'resource.' || coalesce(v_r.file_ext, 'bin')),
    'limit', v_limit,
    'tier', v_tier,
    'remaining', case when v_own then null else greatest(v_limit - v_used - 1, 0) end,
    'resets_at', v_day + interval '1 day'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.dz_revoke_partner(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_is_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if not public.dz_is_partner(p_user) then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update public.profiles set role = 'guest' where id = p_user;
  update public.promo_codes set is_active = false where partner_id = p_user;

  perform public.dz_audit('revoke_partner', p_user, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'changed', true);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_role(p_user uuid DEFAULT auth.uid()) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select role from public.profiles where id = p_user;
$function$;

CREATE OR REPLACE FUNCTION public.dz_section_mod_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_secret text;
  v_on     boolean;
  v_uid    uuid := auth.uid();
  v_imgcol text;
  v_img    text;
  parts    text[];
  v_exp    bigint;
  v_jti    text;
  v_sig    text;
  v_calc   text;
begin
  if NEW.status is distinct from 'approved' then return NEW; end if;
  if v_uid is null then return NEW; end if;

  if TG_NARGS >= 1 then
    v_imgcol := TG_ARGV[0];
    execute format('select ($1).%I::text', v_imgcol) into v_img using NEW;
    if v_img is null or v_img = '' then NEW.mod_token := null; return NEW; end if;
  end if;

  select secret, sections_enforced into v_secret, v_on
    from private.mod_config where id = true;

  if coalesce(v_on, false) is not true then NEW.mod_token := null; return NEW; end if;
  if v_secret is null or v_secret = ''  then NEW.mod_token := null; return NEW; end if;

  if public.is_dev() then NEW.mod_token := null; return NEW; end if;

  parts := string_to_array(coalesce(NEW.mod_token, ''), '.');
  if array_length(parts, 1) is distinct from 3 then
    NEW.status := 'pending'; NEW.mod_token := null; return NEW;
  end if;

  begin
    v_exp := (parts[1])::bigint;
  exception when others then
    NEW.status := 'pending'; NEW.mod_token := null; return NEW;
  end;

  v_jti  := parts[2];
  v_sig  := parts[3];
  v_calc := encode(
    extensions.hmac(v_uid::text || '.' || parts[1] || '.' || v_jti, v_secret, 'sha256'),
    'hex');

  if v_sig = v_calc and v_exp > extract(epoch from now())::bigint then
    begin
      insert into private.used_mod_tokens (jti, user_id) values (v_jti, v_uid);
      NEW.mod_token := null;
      return NEW;
    exception when unique_violation then
      NEW.status := 'pending'; NEW.mod_token := null; return NEW;
    end;
  end if;

  NEW.status := 'pending'; NEW.mod_token := null; return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dz_signup_rate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_ip text;
begin
  if to_regprocedure('public.dz_client_ip()') is null then return NEW; end if;
  begin v_ip := public.dz_client_ip(); exception when others then v_ip := null; end;
  if v_ip is null or v_ip = '' then return NEW; end if;
  if not public.dz_rate_ok('signup:ip:'||v_ip, 6, 3600) then
    raise exception 'Too many accounts created from here recently — try again later' using errcode='P0001';
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_tax_due() RETURNS TABLE(kind text, period date, collected bigint, remit_by date, remitted_at timestamp with time zone, overdue boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if not public.dz_is_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;
  return query
  with m as (
    select date_trunc('month', e.created_at)::date as period,
      sum(round(e.tcs_amount * f.inr_rate *
          case when e.currency in ('JPY','HUF','TWD') then 100 else 1 end))::bigint as tcs,
      sum(round(e.tds_amount * f.inr_rate *
          case when e.currency in ('JPY','HUF','TWD') then 100 else 1 end))::bigint as tds
    from public.marketplace_earnings e
    join public.fx_rates f on f.code = e.currency
    where e.status <> 'reversed'
    group by 1
  ),
  rows_out as (
    select 'gst_tcs'::text as kind, m.period, m.tcs as collected,
           (m.period + interval '1 month' + interval '9 days')::date as remit_by
    from m where m.tcs > 0
    union all
    select 'tds_194o'::text, m.period, m.tds,
           (m.period + interval '1 month' + interval '6 days')::date
    from m where m.tds > 0
  )
  select r.kind, r.period, r.collected, r.remit_by, t.remitted_at,
         (t.remitted_at is null and r.remit_by < current_date) as overdue
  from rows_out r
  left join public.tax_remittances t on t.kind = r.kind and t.period = r.period
  order by r.period desc, r.kind;
end $function$;

CREATE OR REPLACE FUNCTION public.dz_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
begin new.updated_at = now(); return new; end $function$;

CREATE OR REPLACE FUNCTION public.dz_unban_user(p_target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_rows integer;
begin
  if not public.dz_may_moderate(auth.uid(), p_target) then
    raise exception 'not allowed';
  end if;

  update public.user_bans
     set lifted_by = auth.uid(), lifted_at = now()
   where user_id = p_target and lifted_at is null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  perform public.dz_audit('unban_user', p_target, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'changed', true);
end $function$;

CREATE OR REPLACE FUNCTION public.dz_wallet_summary() RETURNS TABLE(currency text, pending_gross bigint, pending_net bigint, pending_gateway bigint, pending_fee bigint, pending_tds bigint, pending_tcs bigint, next_clears_at timestamp with time zone, settlement_note text, available bigint, locked bigint, withdrawable bigint, total_sales bigint, gateway_fees bigint, commission bigint, tds_withheld bigint, tcs_collected bigint, paid_out bigint, items_sold bigint) LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  with e as (
    select
      currency,
      coalesce(sum(gross_amount) filter (where is_pending), 0)  as p_gross,
      coalesce(sum(net_amount)   filter (where is_pending), 0)  as p_net,
      coalesce(sum(gateway_fee)  filter (where is_pending), 0)  as p_gw,
      coalesce(sum(fee_amount)   filter (where is_pending), 0)  as p_fee,
      coalesce(sum(tds_amount)   filter (where is_pending), 0)  as p_tds,
      coalesce(sum(tcs_amount)   filter (where is_pending), 0)  as p_tcs,
      min(available_at)          filter (where is_pending)      as p_next,
      (array_agg(settlement_note order by available_at)
         filter (where is_pending and settlement_note is not null))[1] as p_note,
      coalesce(sum(net_amount) filter (
        where status = 'available' and available_at <= now()), 0) as avail,
      coalesce(sum(gross_amount) filter (where status <> 'reversed'), 0) as gross,
      coalesce(sum(gateway_fee)  filter (where status <> 'reversed'), 0) as gw,
      coalesce(sum(fee_amount)   filter (where status <> 'reversed'), 0) as fee,
      coalesce(sum(tds_amount)   filter (where status <> 'reversed'), 0) as tds,
      coalesce(sum(tcs_amount)   filter (where status <> 'reversed'), 0) as tcs,
      coalesce(sum(net_amount)   filter (where status = 'paid_out'), 0)  as out,
      count(*) filter (where status <> 'reversed') as sold
    from (
      select *, (status = 'pending' or (status = 'available' and available_at > now()))
               as is_pending
      from public.marketplace_earnings where seller_id = auth.uid()
    ) x
    group by currency
  ),
  l as (
    select currency, coalesce(sum(amount), 0) as locked
    from public.payout_requests
    where user_id = auth.uid() and status in ('requested', 'approved', 'processing')
    group by currency
  ),
  cur as (select currency from e union select currency from l)
  select
    c.currency,
    coalesce(e.p_gross, 0)::bigint, coalesce(e.p_net, 0)::bigint,
    coalesce(e.p_gw, 0)::bigint, coalesce(e.p_fee, 0)::bigint,
    coalesce(e.p_tds, 0)::bigint, coalesce(e.p_tcs, 0)::bigint,
    e.p_next, e.p_note,
    coalesce(e.avail, 0)::bigint, coalesce(l.locked, 0)::bigint,
    greatest(coalesce(e.avail, 0) - coalesce(l.locked, 0), 0)::bigint,
    coalesce(e.gross, 0)::bigint, coalesce(e.gw, 0)::bigint, coalesce(e.fee, 0)::bigint,
    coalesce(e.tds, 0)::bigint, coalesce(e.tcs, 0)::bigint,
    coalesce(e.out, 0)::bigint, coalesce(e.sold, 0)::bigint
  from cur c
  left join e on e.currency = c.currency
  left join l on l.currency = c.currency
  order by c.currency;
$function$;

CREATE OR REPLACE FUNCTION public.dz_write_rate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_key text := public.dz_actor_key();
  v_noun text := coalesce(nullif(TG_ARGV[0],''),'requests');
  v_max int := coalesce(nullif(TG_ARGV[1],'')::int, 30);
  v_win int := coalesce(nullif(TG_ARGV[2],'')::int, 3600);
begin
  if v_key is null then
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;
  if left(v_key,2) <> 'u:' then v_max := greatest(1, v_max / 4); end if;
  if not public.dz_rate_ok(TG_TABLE_NAME || ':' || TG_OP || ':' || v_key, v_max, v_win) then
    raise exception 'Too many % in a short time — wait a moment and try again', v_noun using errcode='P0001';
  end if;
  if not public.dz_rate_ok('all:' || v_key, 240, 300) then
    raise exception 'Too many changes in a short time — wait a moment and try again' using errcode='P0001';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_community_links() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_dev boolean := false;
begin
  if NEW.comment_text is null or btrim(NEW.comment_text) = '' then return NEW; end if;
  if to_regprocedure('public.is_dev()') is not null then
    begin v_dev := public.is_dev(); exception when others then v_dev := false; end;
  end if;
  if v_dev then return NEW; end if;
  if public.dz_has_link(NEW.comment_text) then
    raise exception 'CM_NO_LINKS' using errcode='P0001';
  end if;
  if public.dz_phish_score(NEW.comment_text) >= 2 then
    perform public.dz_log_abuse('comments','phish','comment_text',NEW.comment_text);
    return null;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_showcase_cooldown() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
        declare
          last_post timestamptz;
          begin
            if new.channel = 'showcase' then
                select max(created_at) into last_post
                    from public.comments
                        where channel = 'showcase' and user_id = new.user_id;

                            if last_post is not null and new.created_at < last_post + interval '1 hour' then
                                  raise exception 'You can only showcase once every hour. Try again later.';
                                      end if;
                                        end if;
                                          return new;
                                          end;
                                          $function$;

CREATE OR REPLACE FUNCTION public.fr_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_max_friends int := 200;
  v_max_pending int := 100;
  v_n           int;
begin
  if new.status = 'accepted'
     and (TG_OP = 'INSERT' or old.status is distinct from 'accepted') then

    select count(*) into v_n from public.friendships
     where status = 'accepted'
       and (requester_id = new.requester_id or addressee_id = new.requester_id);
    if v_n >= v_max_friends then
      raise exception 'FR_MAX_FRIENDS' using errcode = 'P0001';
    end if;

    select count(*) into v_n from public.friendships
     where status = 'accepted'
       and (requester_id = new.addressee_id or addressee_id = new.addressee_id);
    if v_n >= v_max_friends then
      raise exception 'FR_MAX_FRIENDS' using errcode = 'P0001';
    end if;
  end if;

  if TG_OP = 'INSERT' and new.status = 'pending' then
    select count(*) into v_n from public.friendships
     where status = 'pending' and requester_id = new.requester_id;
    if v_n >= v_max_pending then
      raise exception 'FR_MAX_PENDING' using errcode = 'P0001';
    end if;
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.friendships_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  NEW.requester_id := OLD.requester_id;
  NEW.addressee_id := OLD.addressee_id;
  NEW.created_at   := OLD.created_at;
  NEW.updated_at   := now();
  IF NEW.status = OLD.status AND NEW.blocked_by IS NOT DISTINCT FROM OLD.blocked_by THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    IF auth.uid() <> OLD.addressee_id THEN
      RAISE EXCEPTION 'Only the recipient can accept a friend request';
    END IF;
    NEW.blocked_by := NULL; RETURN NEW;
  END IF;
  IF NEW.status = 'blocked' AND OLD.status <> 'blocked' THEN
    IF auth.uid() <> OLD.requester_id AND auth.uid() <> OLD.addressee_id THEN
      RAISE EXCEPTION 'Not a participant';
    END IF;
    NEW.blocked_by := auth.uid(); RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid friendship transition';
END $function$;

CREATE OR REPLACE FUNCTION public.get_album_artworks(album uuid, lim integer DEFAULT 60, off integer DEFAULT 0) RETURNS TABLE(id uuid, name text, image_url text, thumb_x numeric, thumb_y numeric, thumb_zoom numeric, added_at timestamp with time zone) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select a.id, a.name, a.image_url, a.thumb_x, a.thumb_y, a.thumb_zoom, ai.added_at
  from album_items ai join artworks a on a.id = ai.artwork_id
  where ai.album_id = album and a.status='approved' and a.kind='art'
    and exists(select 1 from albums al where al.id = album and (al.is_public or al.user_id = auth.uid()))
  order by ai.added_at desc
  limit greatest(1, least(coalesce(lim,60),100)) offset greatest(coalesce(off,0),0)
$function$;

CREATE OR REPLACE FUNCTION public.get_artist_progress(target uuid) RETURNS TABLE(uploads bigint, likes_given bigint, bookmarks_given bigint, comments_made bigint, xp integer, level integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH c AS (
    SELECT
      (SELECT count(*) FROM artworks a
        WHERE a.user_id = target AND a.status = 'approved')       AS up,
      (SELECT count(*) FROM artwork_likes l WHERE l.user_id = target)     AS lk,
      (SELECT count(*) FROM artwork_bookmarks b WHERE b.user_id = target) AS bm,
      (SELECT count(*) FROM comments cm WHERE cm.user_id = target)        AS cmt
  )
  SELECT up, lk, bm, cmt,
         (up*10 + lk*2 + bm*2 + cmt)::int,
         public.xp_to_level((up*10 + lk*2 + bm*2 + cmt)::int)
  FROM c
$function$;

CREATE OR REPLACE FUNCTION public.get_profile_engagement(p_user uuid) RETURNS TABLE(total_views bigint, total_likes bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                        select
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            coalesce((select sum(a.view_count)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            from public.artworks a
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           where a.user_id = p_user), 0)::bigint,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               coalesce((select count(*)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               from public.artwork_likes l
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               join public.artworks a2 on a2.id = l.artwork_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              where a2.user_id = p_user), 0)::bigint;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              $function$;

CREATE OR REPLACE FUNCTION public.get_rank_board(board text, lim integer DEFAULT 20, off integer DEFAULT 0) RETURNS TABLE(rnk bigint, uid uuid, username text, avatar_url text, score bigint, lvl integer, total bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with pick as (
    select s.id, s.username, s.avatar_url, s.lvl,
      case lower(coalesce(board,'level'))
        when 'cred'      then s.cred
        when 'likes'     then s.likes
        when 'bookmarks' then s.bookmarks
        else s.xp
      end as score
    from public.rank_scores() s
  ),
  ranked as (
    select rank() over (order by score desc) as rnk,
           count(*) over ()                  as total,
           id, username, avatar_url, lvl, score
    from pick
    where score > 0
  )
  select rnk, id, username, avatar_url, score, lvl, total
  from ranked
  order by rnk asc, username asc
  limit  greatest(1, least(coalesce(lim,20), 50))
  offset greatest(0, coalesce(off,0))
$function$;

CREATE OR REPLACE FUNCTION public.get_rank_me(board text) RETURNS TABLE(rnk bigint, score bigint, lvl integer, total bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with pick as (
    select s.id, s.lvl,
      case lower(coalesce(board,'level'))
        when 'cred'      then s.cred
        when 'likes'     then s.likes
        when 'bookmarks' then s.bookmarks
        else s.xp
      end as score
    from public.rank_scores() s
  ),
  ranked as (
    select rank() over (order by score desc) as rnk,
           count(*) over ()                  as total,
           id, lvl, score
    from pick
    where score > 0
  )
  select r.rnk, r.score, r.lvl, r.total
  from ranked r
  where r.id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_top_tags(lim integer DEFAULT 200) RETURNS TABLE(tag text, uses integer, kind text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with t as (
    select lower(btrim(x)) as tag, count(*)::int as uses
    from artworks a
    cross join lateral unnest(a.tags) x
    where a.status = 'approved' and a.kind = 'art'
      and btrim(x) <> '' and char_length(btrim(x)) <= 15
    group by 1
  ),
  c as (
    select lower(btrim(x)) as tag, count(*)::int as uses
    from artworks a
    cross join lateral unnest(a.category) x
    where a.status = 'approved' and a.kind = 'art'
      and btrim(x) <> '' and char_length(btrim(x)) <= 15
    group by 1
  )
  select tag, uses, kind from (
    select t.tag, t.uses, 'tag'::text as kind from t
    union all
    select c.tag, c.uses, 'cat'::text as kind from c
      where c.tag not in (select t2.tag from t t2)
  ) merged
  order by uses desc, tag asc
  limit greatest(1, least(coalesce(lim, 200), 500))
$function$;

CREATE OR REPLACE FUNCTION public.get_user_albums(target uuid) RETURNS TABLE(id uuid, name text, item_count integer, created_at timestamp with time zone, covers text[], is_public boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select al.id, al.name,
    (select count(*) from album_items ai join artworks a on a.id = ai.artwork_id
      where ai.album_id = al.id and a.status='approved' and a.kind='art')::int,
    al.created_at,
    coalesce((select array_agg(c.image_url order by c.added_at desc) from (
      select a.image_url, ai.added_at from album_items ai join artworks a on a.id = ai.artwork_id
      where ai.album_id = al.id and a.status='approved' and a.kind='art'
      order by ai.added_at desc limit 4) c), '{}'::text[]),
    al.is_public
  from albums al
  where al.user_id = target and (al.is_public or al.user_id = auth.uid())
  order by al.created_at desc
$function$;

CREATE OR REPLACE FUNCTION public.get_user_bookmarked_artworks(target uuid, lim integer DEFAULT 60, off integer DEFAULT 0) RETURNS TABLE(id uuid, name text, image_url text, thumb_x numeric, thumb_y numeric, saved_at timestamp with time zone) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT a.id, a.name, a.image_url, a.thumb_x, a.thumb_y, b.created_at
  FROM artwork_bookmarks b JOIN artworks a ON a.id = b.artwork_id
  WHERE b.user_id = target AND a.status='approved' AND a.kind='art'
    AND (target = auth.uid() OR exists(select 1 from profiles p where p.id=target and p.bookmarks_public))
  ORDER BY b.created_at DESC
  LIMIT greatest(1, least(coalesce(lim,60),100)) OFFSET greatest(coalesce(off,0),0)
$function$;

CREATE OR REPLACE FUNCTION public.get_user_liked_artworks(target uuid, lim integer DEFAULT 60, off integer DEFAULT 0) RETURNS TABLE(id uuid, name text, image_url text, thumb_x numeric, thumb_y numeric, saved_at timestamp with time zone) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT a.id, a.name, a.image_url, a.thumb_x, a.thumb_y, l.created_at
  FROM artwork_likes l JOIN artworks a ON a.id = l.artwork_id
  WHERE l.user_id = target AND a.status='approved' AND a.kind='art'
    AND (target = auth.uid() OR exists(select 1 from profiles p where p.id=target and p.likes_public))
  ORDER BY l.created_at DESC
  LIMIT greatest(1, least(coalesce(lim,60),100)) OFFSET greatest(coalesce(off,0),0)
$function$;

CREATE OR REPLACE FUNCTION public.get_xp_leaderboard(lim integer DEFAULT 10) RETURNS TABLE(user_id uuid, username text, avatar_url text, xp integer, level integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH agg AS (
    SELECT p.id, p.username, p.avatar_url,
      (coalesce(a.up,0)*10 + coalesce(l.lk,0)*2
       + coalesce(b.bm,0)*2 + coalesce(c.cm,0))::int AS xp
    FROM profiles p
    LEFT JOIN (SELECT user_id, count(*) up FROM artworks
                WHERE status = 'approved' AND user_id IS NOT NULL
                GROUP BY 1) a ON a.user_id = p.id
    LEFT JOIN (SELECT user_id, count(*) lk FROM artwork_likes GROUP BY 1) l ON l.user_id = p.id
    LEFT JOIN (SELECT user_id, count(*) bm FROM artwork_bookmarks GROUP BY 1) b ON b.user_id = p.id
    LEFT JOIN (SELECT user_id, count(*) cm FROM comments
                WHERE user_id IS NOT NULL GROUP BY 1) c ON c.user_id = p.id
  )
  SELECT id, username, avatar_url, xp, public.xp_to_level(xp)
  FROM agg
  WHERE xp > 0 AND username IS NOT NULL
  ORDER BY xp DESC, username ASC
  LIMIT greatest(1, least(coalesce(lim,10), 50))
$function$;

CREATE OR REPLACE FUNCTION public.guard_profile_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  cooldown CONSTANT interval := interval '90 days';
BEGIN
  IF coalesce(current_setting('app.allow_cred_count_write', true), '') <> '1'
     AND NOT public.dz_is_privileged() THEN
    NEW.cred_received_count := OLD.cred_received_count;
  END IF;
  IF coalesce(current_setting('app.allow_merit_write', true), '') <> '1'
     AND NOT public.dz_is_privileged() THEN
    NEW.merit            := OLD.merit;
    NEW.merit_updated_at := OLD.merit_updated_at;
  END IF;
  IF NOT public.dz_is_privileged() THEN
    NEW.role                := OLD.role;
    NEW.subscription_tier   := OLD.subscription_tier;
    NEW.username_changed_at := OLD.username_changed_at;
    IF NEW.username IS DISTINCT FROM OLD.username THEN
      IF OLD.username_changed_at IS NOT NULL
         AND (now() - OLD.username_changed_at) < cooldown THEN
        RAISE EXCEPTION 'USERNAME_COOLDOWN until %',
          (OLD.username_changed_at + cooldown) USING errcode = 'P0001';
      END IF;
      NEW.username_changed_at := now();
    END IF;
  ELSE
    IF NEW.username IS DISTINCT FROM OLD.username
       AND NEW.username_changed_at IS NOT DISTINCT FROM OLD.username_changed_at THEN
      NEW.username_changed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  base_name text;
    final_name text;
    begin
        base_name := coalesce(
            nullif(new.raw_user_meta_data->>'username',''),
                nullif(new.raw_user_meta_data->>'full_name',''),
                    nullif(new.raw_user_meta_data->>'name',''),
                        split_part(new.email,'@',1),
                            'user'
                              );
                                  base_name := regexp_replace(base_name, '[^a-zA-Z0-9_.]', '', 'g');
                                    if base_name = '' then base_name := 'user'; end if;
                                      base_name := left(base_name, 30);

                                        final_name := base_name;
                                            while exists (select 1 from public.profiles where username = final_name) loop
                                                final_name := left(base_name, 24) || '_' || substr(md5(random()::text), 1, 4);
                                                  end loop;

                                                    insert into public.profiles (id, username)
                                                      values (new.id, final_name)
                                                        on conflict (id) do nothing;

                                                          return new;
                                                          end;
                                                          $function$;

CREATE OR REPLACE FUNCTION public.is_dev() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
                select exists(
                    select 1 from public.profiles where id = auth.uid() and role = 'dev'
                      );
                      $function$;

CREATE OR REPLACE FUNCTION public.marketplace_file_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare n int;
begin
  select count(*) into n from public.marketplace_file where item_id = new.item_id;
  if n >= 50 then
    raise exception 'A listing can carry at most 50 files';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.my_community_rank(cid uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select coalesce((
    select public.community_rank(role)
      from public.community_members
     where community_id = cid and user_id = auth.uid() and banned = false
  ), 0)
$function$;

CREATE OR REPLACE FUNCTION public.protect_artwork_like_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_counter boolean := false;
begin
  if coalesce(current_setting('app.allow_like_count_write', true), '') <> '1' then
    if TG_OP = 'INSERT' then NEW.like_count := 0; else NEW.like_count := OLD.like_count; end if;
  else v_counter := true; end if;

  if coalesce(current_setting('app.allow_view_count_write', true), '') <> '1' then
    if TG_OP = 'INSERT' then NEW.view_count := 0; else NEW.view_count := OLD.view_count; end if;
  else v_counter := true; end if;

  if coalesce(current_setting('app.allow_bookmark_count_write', true), '') <> '1' then
    if TG_OP = 'INSERT' then NEW.bookmark_count := 0; else NEW.bookmark_count := OLD.bookmark_count; end if;
  else v_counter := true; end if;

  if coalesce(current_setting('app.allow_download_count_write', true), '') <> '1' then
    if TG_OP = 'INSERT' then NEW.download_count := 0; else NEW.download_count := OLD.download_count; end if;
  else v_counter := true; end if;

  if v_counter and TG_OP = 'UPDATE' then
    NEW.updated_at := OLD.updated_at;
  end if;

  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.protect_privileged_cols() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF public.dz_is_privileged() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'not allowed to change role';
  END IF;
  NEW.subscription_tier       := OLD.subscription_tier;
  NEW.subscription_expires_at := OLD.subscription_expires_at;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.publish_due_scheduled_sections() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  r        record;
  moved    int := 0;
  tbl      text;
  fail_msg text;
  collist  text;
  body     jsonb;
  new_id   uuid;
  f        jsonb;
  pos      int;
BEGIN
  FOR r IN
    SELECT * FROM public.scheduled_sections
    WHERE publish_at <= now() AND publish_error IS NULL
    ORDER BY publish_at LIMIT 200
  LOOP
    fail_msg := NULL;
    new_id   := NULL;
    tbl := CASE r.section
             WHEN 'resources'   THEN 'resources'
             WHEN 'blog'        THEN 'blog_posts'
             WHEN 'marketplace' THEN 'marketplace_items'
             WHEN 'jobs'        THEN 'jobs' END;

    IF tbl IS NULL THEN
      fail_msg := 'Unknown section';
    ELSIF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.user_id) THEN
      fail_msg := 'Account no longer active';
    END IF;

    IF fail_msg IS NULL THEN
      body := (r.payload - 'status')
              || jsonb_build_object('status','approved','user_id', r.user_id::text);
      SELECT string_agg(quote_ident(k), ',') INTO collist
      FROM jsonb_object_keys(body) k
      WHERE EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=tbl AND c.column_name=k);
      IF collist IS NULL THEN
        fail_msg := 'Nothing to publish';
      ELSE
        BEGIN
          EXECUTE format(
            'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING id',
            tbl, collist, collist, tbl) USING body INTO new_id;
        EXCEPTION WHEN OTHERS THEN
          fail_msg := left(SQLERRM, 300);
        END;
      END IF;
    END IF;

    IF fail_msg IS NULL AND r.section = 'marketplace' AND new_id IS NOT NULL
       AND jsonb_typeof(r.sell_files) = 'array' THEN
      BEGIN
        pos := 0;
        FOR f IN SELECT * FROM jsonb_array_elements(r.sell_files) LOOP
          INSERT INTO public.marketplace_file
            (user_id, item_id, storage_bucket, storage_path, original_filename, mime, bytes, position)
          VALUES (
            r.user_id, new_id,
            COALESCE(f->>'bucket', 'koe-originals'),
            f->>'path',
            left(COALESCE(f->>'name', 'file'), 260),
            f->>'mime',
            NULLIF(f->>'bytes', '')::bigint,
            pos
          );
          pos := pos + 1;
        END LOOP;
      EXCEPTION WHEN OTHERS THEN
        DELETE FROM public.marketplace_items WHERE id = new_id;
        fail_msg := left('Could not attach the files: ' || SQLERRM, 300);
      END;
    END IF;

    IF fail_msg IS NOT NULL THEN
      UPDATE public.scheduled_sections
         SET publish_error = fail_msg, attempts = attempts + 1, last_attempt_at = now()
       WHERE id = r.id;
      INSERT INTO public.notifications (user_id, type, title, message, ref_table)
      VALUES (r.user_id, 'post_rejected', 'Scheduled post not published',
              COALESCE(r.payload->>'title','Your post') || ' could not be published: ' || fail_msg,
              'scheduled_sections');
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, ref_table)
    VALUES (r.user_id, 'post_published', 'Your scheduled post is live',
            COALESCE(r.payload->>'title','Your post') || ' has been published.', tbl);

    DELETE FROM public.scheduled_sections WHERE id = r.id;
    moved := moved + 1;
  END LOOP;
  RETURN moved;
END; $function$;

CREATE OR REPLACE FUNCTION public.publish_due_scheduled_uploads() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  r        record;
  moved    integer := 0;
  fail_msg text;
  new_art  uuid;
  x        jsonb;
BEGIN
  FOR r IN
    SELECT * FROM public.scheduled_uploads
    WHERE publish_at <= now() AND publish_error IS NULL
    ORDER BY publish_at
    LIMIT 200
  LOOP
    fail_msg := NULL;
    x := COALESCE(r.extra, '{}'::jsonb);

    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.user_id) THEN
      fail_msg := 'Account no longer active';
    ELSIF COALESCE(r.content_rating,'SAFE') = 'ADULT' THEN
      fail_msg := 'Failed content review';
    ELSIF r.phash IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.artworks a
      WHERE a.phash = r.phash AND a.created_at > r.created_at
    ) THEN
      fail_msg := 'This artwork was already published';
    END IF;

    IF fail_msg IS NOT NULL THEN
      UPDATE public.scheduled_uploads
         SET publish_error = fail_msg, attempts = attempts + 1, last_attempt_at = now()
       WHERE id = r.id;
      INSERT INTO public.notifications (user_id, type, title, message, ref_table)
      VALUES (r.user_id, 'artwork_rejected', 'Scheduled artwork not published',
              COALESCE(r.name,'Your artwork') || ' could not be published: ' || fail_msg,
              'scheduled_uploads');
      CONTINUE;
    END IF;

    INSERT INTO public.artworks (
      name, description, tags, category, image_url, storage_path,
      thumb_x, thumb_y, thumb_zoom, pages, kind, user_id, software,
      phash, status, content_rating, is_mature, ai_moderation,
      summary, subject_matter, medium, software_list, license, commercial_use,
      attribution_required, modification_allowed, credits, process_notes,
      external_links, comments_allowed, visibility, featured,
      seo_title, seo_description, slug, file_ext, file_size, width, height
    ) VALUES (
      r.name, r.description, r.tags, r.category, r.image_url, r.storage_path,
      COALESCE(r.thumb_x,50), COALESCE(r.thumb_y,50), COALESCE(r.thumb_zoom,1),
      r.pages, r.kind, r.user_id, r.software,
      r.phash, 'approved', COALESCE(r.content_rating,'SAFE'),
      COALESCE(r.is_mature,false) OR COALESCE((x->>'declared_mature')::boolean, false),
      r.ai_moderation,
      x->>'summary', x->>'subject_matter', x->>'medium',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(x->'software_list')='array' THEN x->'software_list' ELSE '[]'::jsonb END)), '{}'),
      x->>'license',
      COALESCE((x->>'commercial_use')::boolean, false),
      COALESCE((x->>'attribution_required')::boolean, false),
      COALESCE((x->>'modification_allowed')::boolean, false),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(x->'credits')='array' THEN x->'credits' ELSE '[]'::jsonb END)), '{}'),
      x->>'process_notes',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(x->'external_links')='array' THEN x->'external_links' ELSE '[]'::jsonb END)), '{}'),
      COALESCE((x->>'comments_allowed')::boolean, true),
      COALESCE(x->>'visibility', 'published'),
      COALESCE((x->>'featured')::boolean, false),
      x->>'seo_title', x->>'seo_description', x->>'slug',
      x->>'file_ext',
      (x->>'file_size')::bigint, (x->>'width')::int, (x->>'height')::int
    )
    RETURNING id INTO new_art;

    IF r.album_ids IS NOT NULL AND array_length(r.album_ids, 1) > 0 THEN
      INSERT INTO public.album_items (album_id, artwork_id)
      SELECT al.id, new_art
      FROM public.albums al
      WHERE al.id = ANY(r.album_ids) AND al.user_id = r.user_id
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, ref_table)
    VALUES (r.user_id, 'artwork_approved', 'Your scheduled artwork is live',
            COALESCE(r.name,'Your artwork') || ' has been published.', 'artworks');

    DELETE FROM public.scheduled_uploads WHERE id = r.id;
    moved := moved + 1;
  END LOOP;

  RETURN moved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rank_scores() RETURNS TABLE(id uuid, username text, avatar_url text, lvl integer, xp bigint, cred bigint, likes bigint, bookmarks bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with agg as (
    select
      p.id, p.username, p.avatar_url,
      coalesce(p.cred_received_count,0)::bigint as cred,
      coalesce(a.up,0)::bigint  as up,
      coalesce(a.lk,0)::bigint  as likes,
      coalesce(a.bm,0)::bigint  as bookmarks,
      coalesce(lg.c,0)::bigint  as likes_given,
      coalesce(bg.c,0)::bigint  as bm_given,
      coalesce(cm.c,0)::bigint  as comments
    from profiles p
    left join (
      select user_id,
             count(*)                        as up,
             coalesce(sum(like_count),0)     as lk,
             coalesce(sum(bookmark_count),0) as bm
      from artworks
      where status = 'approved' and user_id is not null
      group by 1
    ) a on a.user_id = p.id
    left join (select user_id, count(*) c from artwork_likes     group by 1) lg on lg.user_id = p.id
    left join (select user_id, count(*) c from artwork_bookmarks group by 1) bg on bg.user_id = p.id
    left join (select user_id, count(*) c from comments where user_id is not null group by 1) cm on cm.user_id = p.id
    where p.username is not null
  )
  select
    id, username, avatar_url,
    public.xp_to_level((up*10 + likes_given*2 + bm_given*2 + comments)::int) as lvl,
    (up*10 + likes_given*2 + bm_given*2 + comments)::bigint                  as xp,
    cred, likes, bookmarks
  from agg
$function$;

CREATE OR REPLACE FUNCTION public.regen_merit_daily() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform set_config('app.allow_merit_write', '1', true);
  update public.profiles
     set merit = least(coalesce(merit,100) + 2, 100),
         merit_updated_at = now()
   where merit < 100;
  perform set_config('app.allow_merit_write', '0', true);
end; $function$;

CREATE OR REPLACE FUNCTION public.register_artwork_download(p_artwork uuid, p_anon_key text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_country text DEFAULT NULL::text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_key   text;
  v_ip    text;
  v_owner uuid;
begin
  select a.user_id into v_owner
    from public.artworks a
   where a.id = p_artwork and a.status = 'approved';
  if not found then
    return;
  end if;

  if auth.uid() is not null then
    if not public.dz_rate_ok('dlc:u:' || auth.uid()::text, 60, 60) then
      return;
    end if;
    v_key := 'u:' || auth.uid()::text;
  else
    v_ip := public.dz_client_ip();

    if v_ip is not null then
      if not public.dz_rate_ok('dlc:ip:' || v_ip, 60, 60) then
        return;
      end if;
      v_key := 'a:' || md5('dzdownload|' || v_ip);
    else
      if p_anon_key is null
         or length(p_anon_key) not between 16 and 64
         or p_anon_key !~ '^[A-Za-z0-9-]+$' then
        return;
      end if;
      if not public.dz_rate_ok('dlc:nokey', 300, 60) then
        return;
      end if;
      v_key := 'a:' || p_anon_key;
    end if;
  end if;

  insert into public.artwork_download_dedup (artwork_id, viewer_key, day)
  values (p_artwork, v_key, current_date)
  on conflict do nothing;

  if found then
    perform set_config('app.allow_download_count_write', '1', true);
    update public.artworks
       set download_count = coalesce(download_count, 0) + 1
     where id = p_artwork;
    perform set_config('app.allow_download_count_write', '0', true);

    if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
      insert into public.analytics_events
        (owner_id, actor_id, viewer_key, scope, subject_id, event,
         source, referrer_host, country, device)
      values
        (v_owner, auth.uid(), v_key, 'artwork', p_artwork, 'download',
         case when lower(coalesce(p_source, 'direct')) in
                   ('direct','social','search','referral','internal')
              then lower(p_source) else 'direct' end,
         nullif(left(regexp_replace(lower(coalesce(p_ref, '')), '[^a-z0-9.:-]', '', 'g'), 120), ''),
         public.dz_an_country(p_country),
         case when lower(coalesce(p_device, 'unknown')) in ('mobile','tablet','desktop')
              then lower(p_device) else 'unknown' end)
      on conflict do nothing;
    end if;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.register_artwork_view(p_artwork uuid, p_anon_key text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_country text DEFAULT NULL::text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_key   text;
  v_ip    text;
  v_owner uuid;
begin
  select a.user_id into v_owner
    from public.artworks a
   where a.id = p_artwork and a.status = 'approved';
  if not found then
    return;
  end if;

  if auth.uid() is not null then
    if not public.dz_rate_ok('vw:u:' || auth.uid()::text, 120, 60) then
      return;
    end if;
    v_key := 'u:' || auth.uid()::text;
  else
    v_ip := public.dz_client_ip();

    if v_ip is not null then
      if not public.dz_rate_ok('vw:ip:' || v_ip, 120, 60) then
        return;
      end if;
      v_key := 'a:' || md5('dzview|' || v_ip);
    else
      if p_anon_key is null
         or length(p_anon_key) not between 16 and 64
         or p_anon_key !~ '^[A-Za-z0-9-]+$' then
        return;
      end if;
      if not public.dz_rate_ok('vw:nokey', 600, 60) then
        return;
      end if;
      v_key := 'a:' || p_anon_key;
    end if;
  end if;

  insert into public.artwork_view_dedup (artwork_id, viewer_key, day)
  values (p_artwork, v_key, current_date)
  on conflict do nothing;

  if found then
    perform set_config('app.allow_view_count_write', '1', true);
    update public.artworks
       set view_count = coalesce(view_count, 0) + 1
     where id = p_artwork;
    perform set_config('app.allow_view_count_write', '0', true);

    if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
      insert into public.analytics_events
        (owner_id, actor_id, viewer_key, scope, subject_id, event,
         source, referrer_host, country, device)
      values
        (v_owner, auth.uid(), v_key, 'artwork', p_artwork, 'view',
         case when lower(coalesce(p_source, 'direct')) in
                   ('direct','social','search','referral','internal')
              then lower(p_source) else 'direct' end,
         nullif(left(regexp_replace(lower(coalesce(p_ref, '')), '[^a-z0-9.:-]', '', 'g'), 120), ''),
         public.dz_an_country(p_country),
         case when lower(coalesce(p_device, 'unknown')) in ('mobile','tablet','desktop')
              then lower(p_device) else 'unknown' end)
      on conflict do nothing;
    end if;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.register_item_view(p_kind text, p_subject uuid, p_anon_key text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_country text DEFAULT NULL::text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_key    text;
  v_ip     text;
  v_owner  uuid;
  v_status text;
  v_vis    text;
begin
  if p_kind not in ('marketplace','blog','resource') or p_subject is null then
    return;
  end if;

  if p_kind = 'marketplace' then
    select user_id, status, visibility into v_owner, v_status, v_vis
      from public.marketplace_items where id = p_subject;
  elsif p_kind = 'blog' then
    select user_id, status, visibility into v_owner, v_status, v_vis
      from public.blog_posts where id = p_subject;
  else
    select user_id, status, visibility into v_owner, v_status, v_vis
      from public.resources where id = p_subject;
  end if;

  if v_owner is null then return; end if;
  if v_status is distinct from 'approved' or v_vis is distinct from 'published' then
    return;
  end if;

  if auth.uid() is not null then
    if not public.dz_rate_ok('ivw:u:' || auth.uid()::text, 120, 60) then return; end if;
    v_key := 'u:' || auth.uid()::text;
  else
    v_ip := public.dz_client_ip();
    if v_ip is not null then
      if not public.dz_rate_ok('ivw:ip:' || v_ip, 120, 60) then return; end if;
      v_key := 'a:' || md5('dzview|' || v_ip);
    else
      if p_anon_key is null
         or length(p_anon_key) not between 16 and 64
         or p_anon_key !~ '^[A-Za-z0-9-]+$' then
        return;
      end if;
      if not public.dz_rate_ok('ivw:nokey', 600, 60) then return; end if;
      v_key := 'a:' || p_anon_key;
    end if;
  end if;

  insert into public.item_view_dedup (kind, subject_id, viewer_key, day)
  values (p_kind, p_subject, v_key, current_date)
  on conflict do nothing;

  if not found then return; end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    insert into public.analytics_events
      (owner_id, actor_id, viewer_key, scope, subject_id, event,
       source, referrer_host, country, device)
    values
      (v_owner, auth.uid(), v_key, p_kind, p_subject, 'view',
       case when lower(coalesce(p_source, 'direct')) in
                 ('direct','social','search','referral','internal')
            then lower(p_source) else 'direct' end,
       nullif(left(regexp_replace(lower(coalesce(p_ref, '')), '[^a-z0-9.:-]', '', 'g'), 120), ''),
       public.dz_an_country(p_country),
       case when lower(coalesce(p_device, 'unknown')) in ('mobile','tablet','desktop')
            then lower(p_device) else 'unknown' end)
    on conflict do nothing;
  end if;

  begin
    perform set_config('app.allow_view_count_write', '1', true);
    if p_kind = 'marketplace' then
      update public.marketplace_items set view_count = coalesce(view_count, 0) + 1
       where id = p_subject;
    elsif p_kind = 'blog' then
      update public.blog_posts set view_count = coalesce(view_count, 0) + 1
       where id = p_subject;
    else
      update public.resources set view_count = coalesce(view_count, 0) + 1
       where id = p_subject;
    end if;
    perform set_config('app.allow_view_count_write', '0', true);
  exception when others then
    perform set_config('app.allow_view_count_write', '0', true);
  end;
end $function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_artworks(q text, lim integer DEFAULT 60, off integer DEFAULT 0) RETURNS TABLE(id uuid, name text, image_url text, thumb_x numeric, thumb_y numeric, thumb_zoom numeric, category text[], tags text[], created_at timestamp with time zone, match text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with n as (
    select lower(btrim(coalesce(q,''))) as raw,
           replace(replace(replace(lower(btrim(coalesce(q,''))),'\','\\'),'%','\%'),'_','\_') as pat
  )
  select a.id, a.name, a.image_url, a.thumb_x, a.thumb_y, a.thumb_zoom,
         a.category, a.tags, a.created_at,
         case
           when exists (select 1 from unnest(a.tags) x where lower(btrim(x)) = n.raw)     then 'tag'
           when exists (select 1 from unnest(a.category) x where lower(btrim(x)) = n.raw) then 'category'
           when lower(a.name) like '%'||n.pat||'%' then 'name'
           else 'partial'
         end as match
  from artworks a
  cross join n
  where n.raw <> ''
    and a.status = 'approved' and a.kind = 'art'
    and (
         lower(a.name) like '%'||n.pat||'%'
      or exists (select 1 from unnest(a.tags)     x where lower(btrim(x)) like '%'||n.pat||'%')
      or exists (select 1 from unnest(a.category) x where lower(btrim(x)) like '%'||n.pat||'%')
    )
  order by
    case
      when exists (select 1 from unnest(a.tags) x where lower(btrim(x)) = n.raw)     then 0
      when exists (select 1 from unnest(a.category) x where lower(btrim(x)) = n.raw) then 1
      when lower(a.name) like '%'||n.pat||'%' then 2
      else 3
    end,
    a.created_at desc
  limit  greatest(1, least(coalesce(lim, 60), 100))
  offset greatest(coalesce(off, 0), 0)
$function$;

CREATE OR REPLACE FUNCTION public.sync_artwork_bookmark_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform set_config('app.allow_bookmark_count_write', '1', true);
  if TG_OP = 'INSERT' then
    update public.artworks set bookmark_count = coalesce(bookmark_count,0) + 1
     where id = NEW.artwork_id;
    perform set_config('app.allow_bookmark_count_write', '0', true);
    return NEW;
  else
    update public.artworks set bookmark_count = greatest(coalesce(bookmark_count,0) - 1, 0)
     where id = OLD.artwork_id;
    perform set_config('app.allow_bookmark_count_write', '0', true);
    return OLD;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.sync_artwork_like_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform set_config('app.allow_like_count_write', '1', true);
  if TG_OP = 'INSERT' then
    update public.artworks
       set like_count = coalesce(like_count, 0) + 1
     where id = NEW.artwork_id;
    perform set_config('app.allow_like_count_write', '0', true);
    return NEW;
  else
    update public.artworks
       set like_count = greatest(coalesce(like_count, 0) - 1, 0)
     where id = OLD.artwork_id;
    perform set_config('app.allow_like_count_write', '0', true);
    return OLD;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_cred_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform set_config('app.allow_cred_count_write', '1', true);
  if TG_OP = 'INSERT' then
    update public.profiles set cred_received_count = coalesce(cred_received_count,0) + 1
     where id = NEW.receiver_id;
    perform set_config('app.allow_cred_count_write', '0', true);
    return NEW;
  else
    update public.profiles set cred_received_count = greatest(coalesce(cred_received_count,0) - 1, 0)
     where id = OLD.receiver_id;
    perform set_config('app.allow_cred_count_write', '0', true);
    return OLD;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.sync_profile_username() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
  if new.username is null then
      new.username := 'user_' || substr(new.id::text, 1, 8);
        end if;
          return new;
          end;
          $function$;

CREATE OR REPLACE FUNCTION public.user_tag_prefs_cap_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
  if (select count(*) from public.user_tag_prefs where user_id = new.user_id) >= 200 then
    raise exception 'Tag preference limit reached (200)';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.xp_level_thresholds() RETURNS integer[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT ARRAY[0,8,16,24,32,41,50,59,68,78,88,98,108,119,130,141,152,164,176,188,
    200,213,226,239,252,266,280,294,308,323,338,353,368,384,400,416,432,449,466,483,
    500,518,536,554,572,591,610,629,648,668,688,708,728,749,770,791,812,834,856,878,
    900,923,946,969,992,1016,1040,1064,1089,1115,1141,1167,1193,1220,1247,1274,1301,1329,1357,1385,
    1413,1442,1471,1500,1529,1559,1589,1619,1649,1680,1711,1742,1773,1805,1837,1869,1901,1934,1967,2000]
$function$;

CREATE OR REPLACE FUNCTION public.xp_to_level(xp integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT count(*)::int FROM unnest(public.xp_level_thresholds()) t
  WHERE t <= greatest(coalesce(xp,0), 0)
$function$;

alter table public.artworks add constraint art_credits_len CHECK (arr_items_within(credits, 2, 300));
alter table public.artworks add constraint art_links_len CHECK (arr_items_within(external_links, 5, 200));
alter table public.artworks add constraint art_software_len CHECK (arr_items_within(software_list, 2, 50));
alter table public.artworks add constraint art_tags_len CHECK (arr_items_within(tags, 1, 30));
alter table public.blog_posts add constraint blog_external_refs_len CHECK (arr_items_within(external_refs, 5, 200));
alter table public.blog_posts add constraint blog_tags_len CHECK (arr_items_within(tags, 1, 30));
alter table public.resources add constraint res_compat_sw_len CHECK (arr_items_within(compatible_software, 2, 50));
alter table public.resources add constraint res_links_len CHECK (arr_items_within(external_links, 5, 200));
alter table public.resources add constraint res_tags_len CHECK (arr_items_within(tags, 1, 30));

CREATE TRIGGER albums_cap BEFORE INSERT ON public.albums FOR EACH ROW EXECUTE FUNCTION albums_cap_guard();
CREATE TRIGGER analytics_goals_cap BEFORE INSERT ON public.analytics_goals FOR EACH ROW EXECUTE FUNCTION dz_analytics_goal_cap();
CREATE TRIGGER artworks_touch BEFORE UPDATE ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_touch_updated_at();
CREATE TRIGGER blog_posts_touch BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_touch_updated_at();
CREATE TRIGGER cm_member_cap_ins BEFORE INSERT ON public.community_members FOR EACH ROW EXECUTE FUNCTION cm_member_cap();
CREATE TRIGGER dz_ban_insert_albums BEFORE INSERT ON public.albums FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_analytics_goals BEFORE INSERT ON public.analytics_goals FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_artwork_bookmarks BEFORE INSERT ON public.artwork_bookmarks FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_artwork_file BEFORE INSERT ON public.artwork_file FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_artwork_image BEFORE INSERT ON public.artwork_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_artwork_likes BEFORE INSERT ON public.artwork_likes FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_artwork_reports BEFORE INSERT ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_artworks BEFORE INSERT ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_blog_image BEFORE INSERT ON public.blog_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_blog_posts BEFORE INSERT ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_cart_items BEFORE INSERT ON public.cart_items FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_communities BEFORE INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_community_members BEFORE INSERT ON public.community_members FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_direct_messages BEFORE INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_friendships BEFORE INSERT ON public.friendships FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_hidden_artworks BEFORE INSERT ON public.hidden_artworks FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_item_bookmarks BEFORE INSERT ON public.item_bookmarks FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_item_comments BEFORE INSERT ON public.item_comments FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_item_likes BEFORE INSERT ON public.item_likes FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_item_reports BEFORE INSERT ON public.item_reports FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_jobs BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_marketplace_file BEFORE INSERT ON public.marketplace_file FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_marketplace_image BEFORE INSERT ON public.marketplace_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_marketplace_items BEFORE INSERT ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_profile_banner_image BEFORE INSERT ON public.profile_banner_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_profile_creds BEFORE INSERT ON public.profile_creds FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_profile_image BEFORE INSERT ON public.profile_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_profiles BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_resources BEFORE INSERT ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_resources_file BEFORE INSERT ON public.resources_file FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_resources_image BEFORE INSERT ON public.resources_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_scheduled_sections BEFORE INSERT ON public.scheduled_sections FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_scheduled_uploads BEFORE INSERT ON public.scheduled_uploads FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_insert_user_reports BEFORE INSERT ON public.user_reports FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_albums BEFORE UPDATE ON public.albums FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_analytics_goals BEFORE UPDATE ON public.analytics_goals FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_artwork_file BEFORE UPDATE ON public.artwork_file FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_artwork_image BEFORE UPDATE ON public.artwork_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_artwork_reports BEFORE UPDATE ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_artworks BEFORE UPDATE ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_blog_image BEFORE UPDATE ON public.blog_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_blog_posts BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_communities BEFORE UPDATE ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_jobs BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_marketplace_file BEFORE UPDATE ON public.marketplace_file FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_marketplace_image BEFORE UPDATE ON public.marketplace_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_marketplace_items BEFORE UPDATE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_profile_banner_image BEFORE UPDATE ON public.profile_banner_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_profile_image BEFORE UPDATE ON public.profile_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_resources BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_resources_file BEFORE UPDATE ON public.resources_file FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_resources_image BEFORE UPDATE ON public.resources_image FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_ban_update_scheduled_uploads BEFORE UPDATE ON public.scheduled_uploads FOR EACH ROW EXECUTE FUNCTION dz_ban_gate();
CREATE TRIGGER dz_bounds_blog_posts BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_bounds_on_change('body', '100', '20000', 'required', 'excerpt', '20', '300', 'null-ok', 'title', '5', '120', 'required');
CREATE TRIGGER dz_bounds_marketplace_items BEFORE INSERT OR UPDATE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_bounds_on_change('description', '100', '5000', 'null-ok', 'title', '3', '100', 'required');
CREATE TRIGGER dz_bounds_resources BEFORE INSERT OR UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_bounds_on_change('description', '50', '5000', 'null-ok', 'title', '3', '100', 'required');
CREATE TRIGGER dz_chat_gate_ins BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION dz_chat_gate_comments();
CREATE TRIGGER dz_chat_gate_ins BEFORE INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION dz_chat_gate_dm();
CREATE TRIGGER dz_comment_community_open BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION dz_comment_community_open();
CREATE TRIGGER dz_earning_apply_deductions BEFORE INSERT ON public.marketplace_earnings FOR EACH ROW EXECUTE FUNCTION dz_earning_apply_deductions();
CREATE TRIGGER dz_guard_identity_ins BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_guard_identity();
CREATE TRIGGER dz_guard_identity_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_guard_identity();
CREATE TRIGGER dz_guard_ins_albums_name BEFORE INSERT ON public.albums FOR EACH ROW EXECUTE FUNCTION dz_content_guard('name');
CREATE TRIGGER dz_guard_ins_artwork_reports_details BEFORE INSERT ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION dz_content_guard('details');
CREATE TRIGGER dz_guard_ins_artworks_description BEFORE INSERT ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_ins_blog_posts_body BEFORE INSERT ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_content_guard('body');
CREATE TRIGGER dz_guard_ins_communities_description BEFORE INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_ins_communities_rules BEFORE INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_content_guard('rules');
CREATE TRIGGER dz_guard_ins_item_reports_reason BEFORE INSERT ON public.item_reports FOR EACH ROW EXECUTE FUNCTION dz_content_guard('reason');
CREATE TRIGGER dz_guard_ins_jobs_description BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_ins_marketplace_items_description BEFORE INSERT ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_ins_resources_description BEFORE INSERT ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_insert_direct_messages BEFORE INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION dz_dm_guard();
CREATE TRIGGER dz_guard_insert_item_comments BEFORE INSERT ON public.item_comments FOR EACH ROW EXECUTE FUNCTION dz_content_guard('body');
CREATE TRIGGER dz_guard_upd_albums_name BEFORE UPDATE OF name ON public.albums FOR EACH ROW EXECUTE FUNCTION dz_content_guard('name');
CREATE TRIGGER dz_guard_upd_artwork_reports_details BEFORE UPDATE OF details ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION dz_content_guard('details');
CREATE TRIGGER dz_guard_upd_artworks_description BEFORE UPDATE OF description ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_upd_blog_posts_body BEFORE UPDATE OF body ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_content_guard('body');
CREATE TRIGGER dz_guard_upd_communities_description BEFORE UPDATE OF description ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_upd_communities_rules BEFORE UPDATE OF rules ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_content_guard('rules');
CREATE TRIGGER dz_guard_upd_item_reports_reason BEFORE UPDATE OF reason ON public.item_reports FOR EACH ROW EXECUTE FUNCTION dz_content_guard('reason');
CREATE TRIGGER dz_guard_upd_jobs_description BEFORE UPDATE OF description ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_upd_marketplace_items_description BEFORE UPDATE OF description ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_upd_resources_description BEFORE UPDATE OF description ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_content_guard('description');
CREATE TRIGGER dz_guard_update_item_comments BEFORE UPDATE OF body ON public.item_comments FOR EACH ROW EXECUTE FUNCTION dz_content_guard('body');
CREATE TRIGGER dz_job_post_gate BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_job_post_gate();
CREATE TRIGGER dz_job_schedule_gate BEFORE INSERT ON public.scheduled_sections FOR EACH ROW EXECUTE FUNCTION dz_job_post_gate();
CREATE TRIGGER dz_partner_credit_market AFTER INSERT ON public.marketplace_earnings FOR EACH ROW EXECUTE FUNCTION dz_partner_credit_market();
CREATE TRIGGER dz_partner_credit_sub_ins AFTER INSERT ON public.payments FOR EACH ROW WHEN ((new.status = 'paid'::text)) EXECUTE FUNCTION dz_partner_credit_sub();
CREATE TRIGGER dz_partner_credit_sub_upd AFTER UPDATE OF status ON public.payments FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = 'paid'::text))) EXECUTE FUNCTION dz_partner_credit_sub();
CREATE TRIGGER dz_partner_reverse_earning AFTER UPDATE OF status ON public.marketplace_earnings FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = 'reversed'::text))) EXECUTE FUNCTION dz_partner_reverse();
CREATE TRIGGER dz_partner_reverse_payment AFTER UPDATE OF status ON public.payments FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = ANY (ARRAY['refunded'::text, 'reversed'::text, 'disputed'::text])))) EXECUTE FUNCTION dz_partner_reverse();
CREATE TRIGGER dz_profiles_guard_insert BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_profiles_guard_insert();
CREATE TRIGGER dz_profiles_guard_privileged BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_profiles_guard_privileged();
CREATE TRIGGER dz_range_resources BEFORE INSERT OR UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_range_on_change('file_size', '0', '419430400', 'required');
CREATE TRIGGER dz_rate_delete_analytics_goals BEFORE DELETE ON public.analytics_goals FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_artwork_bookmarks BEFORE DELETE ON public.artwork_bookmarks FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_artwork_file BEFORE DELETE ON public.artwork_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_artwork_image BEFORE DELETE ON public.artwork_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_artwork_likes BEFORE DELETE ON public.artwork_likes FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_artwork_reports BEFORE DELETE ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_blog_image BEFORE DELETE ON public.blog_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_blog_posts BEFORE DELETE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_communities BEFORE DELETE ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_community_members BEFORE DELETE ON public.community_members FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_hidden_artworks BEFORE DELETE ON public.hidden_artworks FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_item_comments BEFORE DELETE ON public.item_comments FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_jobs BEFORE DELETE ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_marketplace_file BEFORE DELETE ON public.marketplace_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_marketplace_image BEFORE DELETE ON public.marketplace_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_marketplace_items BEFORE DELETE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_profile_banner_image BEFORE DELETE ON public.profile_banner_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_profile_creds BEFORE DELETE ON public.profile_creds FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_profile_image BEFORE DELETE ON public.profile_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_resources BEFORE DELETE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_resources_file BEFORE DELETE ON public.resources_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_resources_image BEFORE DELETE ON public.resources_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_delete_scheduled_uploads BEFORE DELETE ON public.scheduled_uploads FOR EACH ROW EXECUTE FUNCTION dz_write_rate('deletions', '200', '300');
CREATE TRIGGER dz_rate_insert_albums BEFORE INSERT ON public.albums FOR EACH ROW EXECUTE FUNCTION dz_write_rate('albums', '40', '3600');
CREATE TRIGGER dz_rate_insert_analytics_goals BEFORE INSERT ON public.analytics_goals FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_artwork_bookmarks BEFORE INSERT ON public.artwork_bookmarks FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_artwork_file BEFORE INSERT ON public.artwork_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_artwork_image BEFORE INSERT ON public.artwork_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_artwork_likes BEFORE INSERT ON public.artwork_likes FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_artwork_reports BEFORE INSERT ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION dz_write_rate('reports', '15', '3600');
CREATE TRIGGER dz_rate_insert_artworks BEFORE INSERT ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_write_rate('uploads', '40', '3600');
CREATE TRIGGER dz_rate_insert_blog_image BEFORE INSERT ON public.blog_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_blog_posts BEFORE INSERT ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_write_rate('posts', '15', '3600');
CREATE TRIGGER dz_rate_insert_cart_items BEFORE INSERT ON public.cart_items FOR EACH ROW EXECUTE FUNCTION dz_write_rate('cart additions', '60', '300');
CREATE TRIGGER dz_rate_insert_communities BEFORE INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_write_rate('communities', '5', '3600');
CREATE TRIGGER dz_rate_insert_community_members BEFORE INSERT ON public.community_members FOR EACH ROW EXECUTE FUNCTION dz_write_rate('community joins', '20', '3600');
CREATE TRIGGER dz_rate_insert_friendships BEFORE INSERT ON public.friendships FOR EACH ROW EXECUTE FUNCTION dz_write_rate('friend requests', '30', '3600');
CREATE TRIGGER dz_rate_insert_hidden_artworks BEFORE INSERT ON public.hidden_artworks FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_item_bookmarks BEFORE INSERT ON public.item_bookmarks FOR EACH ROW EXECUTE FUNCTION dz_write_rate('bookmarks', '60', '300');
CREATE TRIGGER dz_rate_insert_item_comments BEFORE INSERT ON public.item_comments FOR EACH ROW EXECUTE FUNCTION dz_write_rate('comments', '20', '300');
CREATE TRIGGER dz_rate_insert_item_likes BEFORE INSERT ON public.item_likes FOR EACH ROW EXECUTE FUNCTION dz_write_rate('likes', '120', '300');
CREATE TRIGGER dz_rate_insert_item_reports BEFORE INSERT ON public.item_reports FOR EACH ROW EXECUTE FUNCTION dz_write_rate('reports', '15', '3600');
CREATE TRIGGER dz_rate_insert_jobs BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_write_rate('job postings', '15', '3600');
CREATE TRIGGER dz_rate_insert_marketplace_file BEFORE INSERT ON public.marketplace_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_marketplace_image BEFORE INSERT ON public.marketplace_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_marketplace_items BEFORE INSERT ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_write_rate('listings', '20', '3600');
CREATE TRIGGER dz_rate_insert_profile_banner_image BEFORE INSERT ON public.profile_banner_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_profile_creds BEFORE INSERT ON public.profile_creds FOR EACH ROW EXECUTE FUNCTION dz_write_rate('credentials', '30', '3600');
CREATE TRIGGER dz_rate_insert_profile_image BEFORE INSERT ON public.profile_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_profiles BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_resources BEFORE INSERT ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_write_rate('resources', '20', '3600');
CREATE TRIGGER dz_rate_insert_resources_file BEFORE INSERT ON public.resources_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_resources_image BEFORE INSERT ON public.resources_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_insert_scheduled_sections BEFORE INSERT ON public.scheduled_sections FOR EACH ROW EXECUTE FUNCTION dz_write_rate('scheduled posts', '30', '3600');
CREATE TRIGGER dz_rate_insert_scheduled_uploads BEFORE INSERT ON public.scheduled_uploads FOR EACH ROW EXECUTE FUNCTION dz_write_rate('scheduled uploads', '30', '3600');
CREATE TRIGGER dz_rate_insert_user_reports BEFORE INSERT ON public.user_reports FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_albums BEFORE UPDATE ON public.albums FOR EACH ROW EXECUTE FUNCTION dz_write_rate('edits', '120', '3600');
CREATE TRIGGER dz_rate_update_analytics_goals BEFORE UPDATE ON public.analytics_goals FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_artwork_file BEFORE UPDATE ON public.artwork_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_artwork_image BEFORE UPDATE ON public.artwork_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_artwork_reports BEFORE UPDATE ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_artworks BEFORE UPDATE ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_write_rate('edits', '120', '3600');
CREATE TRIGGER dz_rate_update_blog_image BEFORE UPDATE ON public.blog_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_blog_posts BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_write_rate('edits', '120', '3600');
CREATE TRIGGER dz_rate_update_communities BEFORE UPDATE ON public.communities FOR EACH ROW EXECUTE FUNCTION dz_write_rate('community edits', '60', '3600');
CREATE TRIGGER dz_rate_update_community_members BEFORE UPDATE ON public.community_members FOR EACH ROW EXECUTE FUNCTION dz_write_rate('member changes', '120', '3600');
CREATE TRIGGER dz_rate_update_friendships BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION dz_write_rate('friend actions', '60', '3600');
CREATE TRIGGER dz_rate_update_jobs BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_write_rate('edits', '120', '3600');
CREATE TRIGGER dz_rate_update_marketplace_file BEFORE UPDATE ON public.marketplace_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_marketplace_image BEFORE UPDATE ON public.marketplace_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_marketplace_items BEFORE UPDATE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_write_rate('edits', '120', '3600');
CREATE TRIGGER dz_rate_update_profile_banner_image BEFORE UPDATE ON public.profile_banner_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_profile_image BEFORE UPDATE ON public.profile_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_write_rate('profile changes', '60', '3600');
CREATE TRIGGER dz_rate_update_resources BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_write_rate('edits', '120', '3600');
CREATE TRIGGER dz_rate_update_resources_file BEFORE UPDATE ON public.resources_file FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_resources_image BEFORE UPDATE ON public.resources_image FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_rate_update_scheduled_uploads BEFORE UPDATE ON public.scheduled_uploads FOR EACH ROW EXECUTE FUNCTION dz_write_rate('changes', '60', '300');
CREATE TRIGGER dz_signup_rate_ins BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION dz_signup_rate();
CREATE TRIGGER fr_cap_ins BEFORE INSERT ON public.friendships FOR EACH ROW EXECUTE FUNCTION fr_cap();
CREATE TRIGGER fr_cap_upd BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION fr_cap();
CREATE TRIGGER friendships_guard BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION friendships_guard();
CREATE TRIGGER item_comments_fill_username BEFORE INSERT ON public.item_comments FOR EACH ROW EXECUTE FUNCTION dz_fill_comment_username();
CREATE TRIGGER jobs_touch BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION dz_touch_updated_at();
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION dz_ledger_immutable();
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION dz_ledger_immutable();
CREATE TRIGGER marketplace_file_cap_trg BEFORE INSERT ON public.marketplace_file FOR EACH ROW EXECUTE FUNCTION marketplace_file_cap();
CREATE TRIGGER marketplace_touch BEFORE UPDATE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_touch_updated_at();
CREATE TRIGGER profiles_protect_cols BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_privileged_cols();
CREATE TRIGGER resources_touch BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_touch_updated_at();
CREATE TRIGGER trg_artwork_bookmarks_count AFTER INSERT OR DELETE ON public.artwork_bookmarks FOR EACH ROW EXECUTE FUNCTION sync_artwork_bookmark_count();
CREATE TRIGGER trg_artwork_likes_count AFTER INSERT OR DELETE ON public.artwork_likes FOR EACH ROW EXECUTE FUNCTION sync_artwork_like_count();
CREATE TRIGGER trg_artwork_mod_gate BEFORE INSERT ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_artwork_mod_gate();
CREATE TRIGGER trg_artworks_protect_like_count BEFORE INSERT OR UPDATE ON public.artworks FOR EACH ROW EXECUTE FUNCTION protect_artwork_like_count();
CREATE TRIGGER trg_blog_mod_gate BEFORE INSERT ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_section_mod_gate('cover_url');
CREATE TRIGGER trg_community_links BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION enforce_community_links();
CREATE TRIGGER trg_guard_profile_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_update();
CREATE TRIGGER trg_marketplace_mod_gate BEFORE INSERT ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_section_mod_gate();
CREATE TRIGGER trg_profile_creds_count AFTER INSERT OR DELETE ON public.profile_creds FOR EACH ROW EXECUTE FUNCTION sync_profile_cred_count();
CREATE TRIGGER trg_report_merit_penalty AFTER UPDATE ON public.artwork_reports FOR EACH ROW EXECUTE FUNCTION apply_merit_penalty();
CREATE TRIGGER trg_resources_mod_gate BEFORE INSERT ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_section_mod_gate();
CREATE TRIGGER trg_showcase_cooldown BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION enforce_showcase_cooldown();
CREATE TRIGGER trg_sync_profile_username BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION sync_profile_username();
CREATE TRIGGER user_tag_prefs_cap BEFORE INSERT ON public.user_tag_prefs FOR EACH ROW EXECUTE FUNCTION user_tag_prefs_cap_guard();
CREATE TRIGGER zz_dz_repeat_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION dz_repeat_guard('comment_text', '5');
CREATE TRIGGER zz_dz_repeat_direct_messages BEFORE INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION dz_repeat_guard('content', '5');
CREATE TRIGGER zz_dz_repeat_item_comments BEFORE INSERT ON public.item_comments FOR EACH ROW EXECUTE FUNCTION dz_repeat_guard('body', '5');
CREATE TRIGGER zz_mod_token_clear BEFORE UPDATE ON public.artworks FOR EACH ROW EXECUTE FUNCTION dz_mod_token_clear();
CREATE TRIGGER zz_mod_token_clear BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_mod_token_clear();
CREATE TRIGGER zz_mod_token_clear BEFORE UPDATE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_mod_token_clear();
CREATE TRIGGER zz_mod_token_clear BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_mod_token_clear();
CREATE TRIGGER zz_protect_social_counters BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_protect_social_counters();
CREATE TRIGGER zz_protect_social_counters BEFORE INSERT OR UPDATE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_protect_social_counters();
CREATE TRIGGER zz_protect_social_counters BEFORE INSERT OR UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_protect_social_counters();
CREATE TRIGGER zz_protect_view_count BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION dz_protect_item_view_count();
CREATE TRIGGER zz_protect_view_count BEFORE INSERT OR UPDATE ON public.marketplace_items FOR EACH ROW EXECUTE FUNCTION dz_protect_item_view_count();
CREATE TRIGGER zz_protect_view_count BEFORE INSERT OR UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION dz_protect_item_view_count();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy album_items_delete_own on public.album_items as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1
   FROM albums al
  WHERE ((al.id = album_items.album_id) AND (al.user_id = auth.uid())))));
create policy album_items_insert_own on public.album_items as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM albums al
  WHERE ((al.id = album_items.album_id) AND (al.user_id = auth.uid())))));
create policy album_items_read on public.album_items as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM albums al
  WHERE ((al.id = album_items.album_id) AND (al.is_public OR (al.user_id = auth.uid()))))));
create policy albums_delete_own on public.albums as PERMISSIVE for DELETE to public using ((user_id = auth.uid()));
create policy albums_insert_own on public.albums as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy albums_read on public.albums as PERMISSIVE for SELECT to public using ((is_public OR (user_id = auth.uid())));
create policy albums_update_own on public.albums as PERMISSIVE for UPDATE to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy analytics_events_select_own on public.analytics_events as PERMISSIVE for SELECT to authenticated using ((owner_id = auth.uid()));
create policy analytics_goals_all_own on public.analytics_goals as PERMISSIVE for ALL to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy bm_delete_own on public.artwork_bookmarks as PERMISSIVE for DELETE to authenticated using ((user_id = auth.uid()));
create policy bm_insert_own on public.artwork_bookmarks as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND (current_merit() > 40)));
create policy bm_select_own on public.artwork_bookmarks as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy "artwork_file delete own" on public.artwork_file as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "artwork_file insert own" on public.artwork_file as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "artwork_file select own" on public.artwork_file as PERMISSIVE for SELECT to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "artwork_file update own" on public.artwork_file as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy "artwork_image delete own" on public.artwork_image as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "artwork_image insert own" on public.artwork_image as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "artwork_image select public" on public.artwork_image as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "artwork_image update own" on public.artwork_image as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy likes_delete_own on public.artwork_likes as PERMISSIVE for DELETE to authenticated using ((user_id = auth.uid()));
create policy likes_insert_own on public.artwork_likes as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND (current_merit() > 40)));
create policy likes_select_own on public.artwork_likes as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy reports_delete_dev on public.artwork_reports as PERMISSIVE for DELETE to authenticated using (is_dev());
create policy reports_insert_own on public.artwork_reports as PERMISSIVE for INSERT to authenticated with check ((reporter_id = auth.uid()));
create policy reports_select_dev on public.artwork_reports as PERMISSIVE for SELECT to authenticated using (is_dev());
create policy reports_update_dev on public.artwork_reports as PERMISSIVE for UPDATE to authenticated using (is_dev()) with check (is_dev());
create policy "Users can delete their own artworks" on public.artworks as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy "Users can update their own artworks" on public.artworks as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy artworks_insert_own on public.artworks as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (current_merit() >= 80)));
create policy "public read approved" on public.artworks as PERMISSIVE for SELECT to public using (((status = 'approved'::text) OR (user_id = auth.uid())));
create policy "blog_image delete own" on public.blog_image as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "blog_image insert own" on public.blog_image as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "blog_image select public" on public.blog_image as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "blog_image update own" on public.blog_image as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy blog_posts_delete_own on public.blog_posts as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy blog_posts_insert_own on public.blog_posts as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (current_merit() >= 80)));
create policy blog_posts_public_read on public.blog_posts as PERMISSIVE for SELECT to public using (((status = 'approved'::text) OR (user_id = auth.uid())));
create policy blog_posts_update_own on public.blog_posts as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy cart_items_delete_own on public.cart_items as PERMISSIVE for DELETE to public using ((user_id = auth.uid()));
create policy cart_items_insert_own on public.cart_items as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy cart_items_select_own on public.cart_items as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));
create policy "Users can delete their own comics" on public.comics as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy "Users can update their own comics" on public.comics as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy comics_insert_own on public.comics as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy comics_select_public on public.comics as PERMISSIVE for SELECT to public using (((status = 'approved'::text) OR (user_id = auth.uid())));
create policy comments_delete_own_or_staff on public.comments as PERMISSIVE for DELETE to public using (((user_id = auth.uid()) OR is_dev() OR ((community_channel_id(channel) IS NOT NULL) AND (my_community_rank(community_channel_id(channel)) >= 2))));
create policy comments_select on public.comments as PERMISSIVE for SELECT to anon, authenticated using (((community_channel_id(channel) IS NULL) OR can_read_community(community_channel_id(channel))));
create policy insert_non_official_comments on public.comments as PERMISSIVE for INSERT to authenticated with check (((channel <> 'official'::text) AND (user_id = auth.uid()) AND (current_merit() > 60) AND ((community_channel_id(channel) IS NULL) OR can_post_community(community_channel_id(channel)))));
create policy insert_official_comments_dev_only on public.comments as PERMISSIVE for INSERT to authenticated with check (((channel = 'official'::text) AND is_dev()));
create policy communities_delete_owner on public.communities as PERMISSIVE for DELETE to authenticated using ((owner_id = auth.uid()));
create policy communities_insert_lvl100 on public.communities as PERMISSIVE for INSERT to authenticated with check (((owner_id = auth.uid()) AND (current_artist_level() >= 100)));
create policy communities_read on public.communities as PERMISSIVE for SELECT to anon, authenticated using ((is_public OR (owner_id = auth.uid()) OR can_read_community(id)));
create policy communities_update_owner on public.communities as PERMISSIVE for UPDATE to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
create policy cm_leave_self on public.community_members as PERMISSIVE for DELETE to authenticated using ((user_id = auth.uid()));
create policy cm_read on public.community_members as PERMISSIVE for SELECT to authenticated using (true);
create policy dm_insert_friends_only on public.direct_messages as PERMISSIVE for INSERT to public with check (((auth.uid() = sender_id) AND (sender_id <> recipient_id) AND (EXISTS ( SELECT 1
   FROM friendships f
  WHERE ((f.status = 'accepted'::text) AND (LEAST(f.requester_id, f.addressee_id) = LEAST(direct_messages.sender_id, direct_messages.recipient_id)) AND (GREATEST(f.requester_id, f.addressee_id) = GREATEST(direct_messages.sender_id, direct_messages.recipient_id)))))));
create policy dm_select_participants on public.direct_messages as PERMISSIVE for SELECT to authenticated using (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));
create policy fr_delete_participants on public.friendships as PERMISSIVE for DELETE to public using ((((auth.uid() = requester_id) OR (auth.uid() = addressee_id)) AND ((status <> 'blocked'::text) OR (blocked_by = auth.uid()))));
create policy fr_insert_request on public.friendships as PERMISSIVE for INSERT to public with check (((auth.uid() = requester_id) AND (status = 'pending'::text) AND (blocked_by IS NULL)));
create policy fr_select_participants on public.friendships as PERMISSIVE for SELECT to public using (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));
create policy fr_update_participants on public.friendships as PERMISSIVE for UPDATE to public using ((((auth.uid() = requester_id) OR (auth.uid() = addressee_id)) AND ((status <> 'blocked'::text) OR (blocked_by = auth.uid())))) with check (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));
create policy fx_rates_read on public.fx_rates as PERMISSIVE for SELECT to public using (true);
create policy hidden_delete_own on public.hidden_artworks as PERMISSIVE for DELETE to authenticated using ((user_id = auth.uid()));
create policy hidden_insert_own on public.hidden_artworks as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy hidden_select_own on public.hidden_artworks as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy item_bookmarks_delete_own on public.item_bookmarks as PERMISSIVE for DELETE to public using ((user_id = auth.uid()));
create policy item_bookmarks_insert_own on public.item_bookmarks as PERMISSIVE for INSERT to public with check (((user_id = auth.uid()) AND (current_merit() > 40)));
create policy item_bookmarks_select_own on public.item_bookmarks as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));
create policy item_comments_delete_own on public.item_comments as PERMISSIVE for DELETE to authenticated using (((auth.uid() = user_id) OR is_dev()));
create policy item_comments_insert_own on public.item_comments as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (current_merit() >= 80)));
create policy item_comments_read on public.item_comments as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy item_likes_delete_own on public.item_likes as PERMISSIVE for DELETE to public using ((user_id = auth.uid()));
create policy item_likes_insert_own on public.item_likes as PERMISSIVE for INSERT to public with check (((user_id = auth.uid()) AND (current_merit() > 40)));
create policy item_likes_select_own on public.item_likes as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));
create policy item_reports_dev_read on public.item_reports as PERMISSIVE for SELECT to authenticated using (is_dev());
create policy item_reports_insert_own on public.item_reports as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = reporter_id));
create policy jobs_delete_own on public.jobs as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy jobs_insert_own on public.jobs as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (current_merit() >= 80)));
create policy jobs_public_read on public.jobs as PERMISSIVE for SELECT to public using (((status = 'approved'::text) OR (user_id = auth.uid())));
create policy jobs_update_own on public.jobs as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy ledger_select_own on public.ledger_entries as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy earnings_select_own on public.marketplace_earnings as PERMISSIVE for SELECT to public using ((auth.uid() = seller_id));
create policy "marketplace_file delete own" on public.marketplace_file as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "marketplace_file insert own" on public.marketplace_file as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "marketplace_file select own" on public.marketplace_file as PERMISSIVE for SELECT to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "marketplace_file update own" on public.marketplace_file as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy "marketplace_image delete own" on public.marketplace_image as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "marketplace_image insert own" on public.marketplace_image as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "marketplace_image select public" on public.marketplace_image as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "marketplace_image update own" on public.marketplace_image as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy marketplace_items_delete_own on public.marketplace_items as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy marketplace_items_insert_own on public.marketplace_items as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (current_merit() >= 80)));
create policy marketplace_items_public_read on public.marketplace_items as PERMISSIVE for SELECT to public using (((status = 'approved'::text) OR (user_id = auth.uid())));
create policy marketplace_items_update_own on public.marketplace_items as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy modlog_insert_own on public.moderation_logs as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy modlog_select_own_or_dev on public.moderation_logs as PERMISSIVE for SELECT to authenticated using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'dev'::text))))));
create policy notification_reads_insert_own on public.notification_reads as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy notification_reads_select_own on public.notification_reads as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));
create policy notifications_insert_dev_only on public.notifications as PERMISSIVE for INSERT to public with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'dev'::text)))));
create policy notifications_select on public.notifications as PERMISSIVE for SELECT to public using (((user_id IS NULL) OR (user_id = auth.uid())));
create policy payments_select_own on public.payments as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy payout_methods_select_own on public.payout_methods as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy payout_requests_select_own on public.payout_requests as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "profile_banner_image delete own" on public.profile_banner_image as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "profile_banner_image insert own" on public.profile_banner_image as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "profile_banner_image select public" on public.profile_banner_image as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "profile_banner_image update own" on public.profile_banner_image as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy creds_delete_own on public.profile_creds as PERMISSIVE for DELETE to authenticated using ((giver_id = auth.uid()));
create policy creds_insert_own on public.profile_creds as PERMISSIVE for INSERT to authenticated with check (((giver_id = auth.uid()) AND (giver_id <> receiver_id)));
create policy creds_select_own_given on public.profile_creds as PERMISSIVE for SELECT to authenticated using ((giver_id = auth.uid()));
create policy "profile_image delete own" on public.profile_image as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "profile_image insert own" on public.profile_image as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "profile_image select public" on public.profile_image as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "profile_image update own" on public.profile_image as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy profiles_insert_own on public.profiles as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = id));
create policy profiles_select_public on public.profiles as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy profiles_update_own_no_role_change on public.profiles as PERMISSIVE for UPDATE to public using ((auth.uid() = id)) with check (((auth.uid() = id) AND (role = ( SELECT profiles_1.role
   FROM profiles profiles_1
  WHERE (profiles_1.id = auth.uid())))));
create policy recon_flags_select_own on public.reconciliation_flags as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy resources_delete_own on public.resources as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy resources_insert_own on public.resources as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (current_merit() >= 80)));
create policy resources_public_read on public.resources as PERMISSIVE for SELECT to public using (((status = 'approved'::text) OR (user_id = auth.uid())));
create policy resources_update_own on public.resources as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "resources_file delete own" on public.resources_file as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "resources_file insert own" on public.resources_file as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "resources_file select own" on public.resources_file as PERMISSIVE for SELECT to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "resources_file update own" on public.resources_file as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy "resources_image delete own" on public.resources_image as PERMISSIVE for DELETE to authenticated using (((user_id = auth.uid()) OR is_dev()));
create policy "resources_image insert own" on public.resources_image as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) OR is_dev()));
create policy "resources_image select public" on public.resources_image as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "resources_image update own" on public.resources_image as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) OR is_dev())) with check (((user_id = auth.uid()) OR is_dev()));
create policy secsched_delete_own on public.scheduled_sections as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy secsched_insert_own on public.scheduled_sections as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy secsched_select_own on public.scheduled_sections as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy secsched_update_own on public.scheduled_sections as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy sched_delete_own on public.scheduled_uploads as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy sched_insert_own on public.scheduled_uploads as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy sched_select_own on public.scheduled_uploads as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy sched_update_own on public.scheduled_uploads as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy seller_tax_select_own on public.seller_tax as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy settings_select_public on public.settings as PERMISSIVE for SELECT to public using (true);
create policy upload_events_insert_own on public.upload_events as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy upload_events_select_own on public.upload_events as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy user_reports_insert_own on public.user_reports as PERMISSIVE for INSERT to authenticated with check (((reporter_id = auth.uid()) AND (target_id <> auth.uid())));
create policy utp_delete_own on public.user_tag_prefs as PERMISSIVE for DELETE to public using ((user_id = auth.uid()));
create policy utp_insert_own on public.user_tag_prefs as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy utp_select_own on public.user_tag_prefs as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));

create policy "avatars delete own" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'koe-media'::text) AND ((storage.foldername(name))[1] = 'avatars'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "avatars insert own" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'koe-media'::text) AND ((storage.foldername(name))[1] = 'avatars'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "banners delete own" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'koe-media'::text) AND ((storage.foldername(name))[1] = 'banners'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "banners insert own" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'koe-media'::text) AND ((storage.foldername(name))[1] = 'banners'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "dev delete templates storage" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'koe-media'::text) AND is_dev()));
create policy "dev update templates storage" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'koe-media'::text) AND is_dev()));
create policy "dev upload templates" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'koe-media'::text) AND is_dev() AND ((name ~~ 'templates/previews/%'::text) OR (name ~~ 'templates/files/%'::text))));
create policy "originals delete own folder" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'koe-originals'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR is_dev())));
create policy "originals insert own folder" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'koe-originals'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR is_dev())));
create policy "originals select own folder" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'koe-originals'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR is_dev())));
create policy "originals update own folder" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'koe-originals'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR is_dev()))) with check (((bucket_id = 'koe-originals'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR is_dev())));
create policy storage_user_upload_own_folder on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'koe-media'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR is_dev())));

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke execute on all functions in schema public from public, anon, authenticated, service_role;
revoke all on all tables in schema private from anon, authenticated, service_role;

grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;

grant all on public.album_items, public.albums, public.an_bookmark, public.an_download to service_role;
grant all on public.an_item, public.an_like, public.an_view, public.analytics_events to service_role;
grant all on public.analytics_goals, public.artwork_bookmarks, public.artwork_download_dedup, public.artwork_file to service_role;
grant all on public.artwork_image, public.artwork_likes, public.artwork_reports, public.artwork_view_dedup to service_role;
grant all on public.artworks, public.audit_log, public.auth_attempts, public.blog_image to service_role;
grant all on public.blog_posts, public.cart_items, public.chat_cooldowns, public.chat_rate_events to service_role;
grant all on public.comics, public.comments, public.communities, public.community_members to service_role;
grant all on public.content_repeats, public.direct_messages, public.download_events, public.dz_abuse_events to service_role;
grant all on public.dz_secrets, public.friendships, public.fx_rates, public.hidden_artworks to service_role;
grant all on public.item_bookmarks, public.item_comments, public.item_likes, public.item_reports to service_role;
grant all on public.item_view_dedup, public.jobs, public.marketplace_earnings, public.marketplace_file to service_role;
grant all on public.marketplace_image, public.marketplace_items, public.moderation_logs, public.notification_reads to service_role;
grant all on public.notifications, public.partner_commissions, public.payments, public.payout_methods to service_role;
grant all on public.payout_requests, public.platform_tax_config, public.profile_banner_image, public.profile_creds to service_role;
grant all on public.profile_image, public.profiles, public.promo_codes, public.rate_hits to service_role;
grant all on public.reconciliation_flags, public.reserved_names, public.resources, public.resources_file to service_role;
grant all on public.resources_image, public.scheduled_sections, public.scheduled_uploads, public.seller_tax to service_role;
grant all on public.settings, public.settlement_windows, public.subscription_prices, public.support_limits to service_role;
grant all on public.tax_remittances, public.upload_events, public.user_bans, public.user_reports to service_role;
grant all on public.user_tag_prefs, public.wallet_history to service_role;
grant all on public.ledger_entries to service_role;
revoke update, delete on public.ledger_entries from service_role;

grant SELECT on public.album_items, public.albums, public.artwork_image, public.artworks to anon;
grant SELECT on public.blog_image, public.blog_posts, public.comics, public.comments to anon;
grant SELECT on public.fx_rates, public.item_comments, public.jobs, public.marketplace_image to anon;
grant SELECT on public.notifications, public.profile_banner_image, public.profile_image, public.resources to anon;
grant SELECT on public.resources_image, public.settings to anon;
grant all on public.wallet_history to anon;

grant INSERT, UPDATE, DELETE on public.marketplace_items to authenticated;
grant INSERT on public.user_reports to authenticated;
grant SELECT, DELETE on public.community_members to authenticated;
grant SELECT, INSERT on public.direct_messages, public.item_reports, public.moderation_logs, public.notifications to authenticated;
grant SELECT, INSERT on public.upload_events to authenticated;
grant SELECT, INSERT, DELETE on public.album_items, public.artwork_bookmarks, public.artwork_likes, public.cart_items to authenticated;
grant SELECT, INSERT, DELETE on public.comments, public.hidden_artworks, public.item_bookmarks, public.item_comments to authenticated;
grant SELECT, INSERT, DELETE on public.item_likes, public.profile_creds, public.user_tag_prefs to authenticated;
grant SELECT, INSERT, UPDATE on public.notification_reads to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.albums, public.analytics_goals, public.artwork_file, public.artwork_image to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.artwork_reports, public.artworks, public.blog_image, public.blog_posts to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.comics, public.communities, public.friendships, public.jobs to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.marketplace_file, public.marketplace_image, public.profile_banner_image, public.profile_image to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.resources, public.resources_file, public.resources_image, public.scheduled_sections to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.scheduled_uploads to authenticated;
grant SELECT on public.analytics_events, public.fx_rates, public.ledger_entries, public.marketplace_earnings to authenticated;
grant SELECT on public.payments, public.payout_methods, public.payout_requests, public.reconciliation_flags to authenticated;
grant SELECT on public.seller_tax, public.settings to authenticated;
grant all on public.wallet_history to authenticated;

grant INSERT (about_company, experience_level, years_experience, openings, responsibilities, requirements, required_skills, nice_to_have_skills, benefits, work_mode, timezone, working_hours, schedule, start_date, contract_duration, application_instructions, application_materials, application_questions, portfolio_required, resume_required, cover_letter_required, visibility, featured) on public.jobs to authenticated;
grant INSERT (content_type, related_artworks, related_items, external_refs, visibility, featured, author_bio, seo_title, seo_description, mod_token) on public.blog_posts to authenticated;
grant INSERT (extra) on public.scheduled_uploads to authenticated;
grant INSERT (id, email, created_at, username, bio, avatar_url, avatar_storage_path, avatar_updated_at, banner_url, banner_storage_path, banner_updated_at, social_links, display_name, username_changed_at, likes_public, bookmarks_public, currency) on public.profiles to authenticated;
grant INSERT (product_type, summary, subcategory, buyer_gets, file_format, file_count, file_size_mb, dimensions, software, source_files_included, commercial_use, personal_use, modification_allowed, attribution_required, sale_price_cents, stock, delivery_type, delivery_notes, custom_requests, revision_count, support_period, refund_policy, preview_watermark, safety_notes, seller_note, apply_url, apply_email, visibility, featured, closing_date, internal_notes, seo_title, seo_description, slug, mod_token) on public.marketplace_items to authenticated;
grant INSERT (summary, resource_type, subcategory, commercial_use, attribution_required, modification_allowed, compatible_software, compatible_versions, whats_included, instructions, version, external_links, safety_notes, visibility, featured, file_count, dimensions, seo_title, seo_description, slug, mod_token) on public.resources to authenticated;
grant INSERT (summary, subject_matter, medium, software_list, license, commercial_use, attribution_required, modification_allowed, credits, process_notes, external_links, comments_allowed, visibility, featured, seo_title, seo_description, slug, file_ext, file_size, width, height, updated_at) on public.artworks to authenticated;
grant SELECT (about_company, experience_level, years_experience, openings, responsibilities, requirements, required_skills, nice_to_have_skills, benefits, work_mode, timezone, working_hours, schedule, start_date, contract_duration, application_instructions, application_materials, application_questions, portfolio_required, resume_required, cover_letter_required, visibility, featured) on public.jobs to anon;
grant SELECT (about_company, experience_level, years_experience, openings, responsibilities, requirements, required_skills, nice_to_have_skills, benefits, work_mode, timezone, working_hours, schedule, start_date, contract_duration, application_instructions, application_materials, application_questions, portfolio_required, resume_required, cover_letter_required, visibility, featured) on public.jobs to authenticated;
grant SELECT (content_type, related_artworks, related_items, external_refs, visibility, featured, author_bio, seo_title, seo_description, bookmark_count) on public.blog_posts to anon;
grant SELECT (content_type, related_artworks, related_items, external_refs, visibility, featured, author_bio, seo_title, seo_description, bookmark_count) on public.blog_posts to authenticated;
grant SELECT (extra) on public.scheduled_uploads to authenticated;
grant SELECT (id, name, description, avatar_url, banner_url, rules, owner_id, created_at, short_description, is_public, avatar_storage_path, plan_backed) on public.communities to anon;
grant SELECT (id, role, created_at, subscription_tier, username, bio, avatar_url, avatar_storage_path, avatar_updated_at, banner_url, banner_storage_path, banner_updated_at, social_links, display_name, username_changed_at, cred_received_count, merit, merit_updated_at, subscription_expires_at, likes_public, bookmarks_public) on public.profiles to anon;
grant SELECT (id, role, created_at, subscription_tier, username, bio, avatar_url, avatar_storage_path, avatar_updated_at, banner_url, banner_storage_path, banner_updated_at, social_links, display_name, username_changed_at, cred_received_count, merit, merit_updated_at, subscription_expires_at, likes_public, bookmarks_public) on public.profiles to authenticated;
grant SELECT (id, user_id, title, description, category, tags, item_type, currency, file_name, file_ext, file_size, preview_url, gallery, license, delivery_days, sales_count, like_count, view_count, status, created_at, updated_at, product_type, summary, subcategory, buyer_gets, file_format, file_count, file_size_mb, dimensions, software, source_files_included, commercial_use, personal_use, modification_allowed, attribution_required, stock, delivery_type, delivery_notes, custom_requests, revision_count, support_period, refund_policy, preview_watermark, safety_notes, seller_note, apply_url, apply_email, visibility, featured, closing_date, seo_title, seo_description, slug) on public.marketplace_items to anon;
grant SELECT (id, user_id, title, description, category, tags, item_type, price_cents, currency, file_name, file_ext, file_size, preview_url, gallery, license, delivery_days, sales_count, like_count, view_count, status, created_at, updated_at, product_type, summary, subcategory, buyer_gets, file_format, file_count, file_size_mb, dimensions, software, source_files_included, commercial_use, personal_use, modification_allowed, attribution_required, sale_price_cents, stock, delivery_type, delivery_notes, custom_requests, revision_count, support_period, refund_policy, preview_watermark, safety_notes, seller_note, apply_url, apply_email, visibility, featured, closing_date, seo_title, seo_description, slug) on public.marketplace_items to authenticated;
grant SELECT (summary, resource_type, subcategory, commercial_use, attribution_required, modification_allowed, compatible_software, compatible_versions, whats_included, instructions, version, external_links, safety_notes, visibility, featured, file_count, dimensions, seo_title, seo_description, slug) on public.resources to anon;
grant SELECT (summary, resource_type, subcategory, commercial_use, attribution_required, modification_allowed, compatible_software, compatible_versions, whats_included, instructions, version, external_links, safety_notes, visibility, featured, file_count, dimensions, seo_title, seo_description, slug) on public.resources to authenticated;
grant SELECT (summary, subject_matter, medium, software_list, license, commercial_use, attribution_required, modification_allowed, credits, process_notes, external_links, comments_allowed, visibility, featured, seo_title, seo_description, slug, file_ext, file_size, width, height, updated_at) on public.artworks to anon;
grant SELECT (summary, subject_matter, medium, software_list, license, commercial_use, attribution_required, modification_allowed, credits, process_notes, external_links, comments_allowed, visibility, featured, seo_title, seo_description, slug, file_ext, file_size, width, height, updated_at) on public.artworks to authenticated;
grant UPDATE (about_company, experience_level, years_experience, openings, responsibilities, requirements, required_skills, nice_to_have_skills, benefits, work_mode, timezone, working_hours, schedule, start_date, contract_duration, application_instructions, application_materials, application_questions, portfolio_required, resume_required, cover_letter_required, visibility, featured) on public.jobs to authenticated;
grant UPDATE (content_type, related_artworks, related_items, external_refs, visibility, featured, author_bio, seo_title, seo_description) on public.blog_posts to authenticated;
grant UPDATE (extra) on public.scheduled_uploads to authenticated;
grant UPDATE (product_type, summary, subcategory, buyer_gets, file_format, file_count, file_size_mb, dimensions, software, source_files_included, commercial_use, personal_use, modification_allowed, attribution_required, sale_price_cents, stock, delivery_type, delivery_notes, custom_requests, revision_count, support_period, refund_policy, preview_watermark, safety_notes, seller_note, apply_url, apply_email, visibility, featured, closing_date, internal_notes, seo_title, seo_description, slug) on public.marketplace_items to authenticated;
grant UPDATE (summary, resource_type, subcategory, commercial_use, attribution_required, modification_allowed, compatible_software, compatible_versions, whats_included, instructions, version, external_links, safety_notes, visibility, featured, file_count, dimensions, seo_title, seo_description, slug) on public.resources to authenticated;
grant UPDATE (summary, subject_matter, medium, software_list, license, commercial_use, attribution_required, modification_allowed, credits, process_notes, external_links, comments_allowed, visibility, featured, seo_title, seo_description, slug, file_ext, file_size, width, height, updated_at) on public.artworks to authenticated;
grant UPDATE (username, bio, avatar_url, avatar_storage_path, avatar_updated_at, banner_url, banner_storage_path, banner_updated_at, social_links, display_name, likes_public, bookmarks_public) on public.profiles to authenticated;

grant execute on function public.arr_items_within(a text[], lo integer, hi integer), public.can_post_community(cid uuid), public.can_read_community(cid uuid), public.cm_browse(p_q text, p_limit integer, p_offset integer), public.cm_delete(cid uuid), public.cm_grace_days() to PUBLIC, anon, authenticated, service_role;
grant execute on function public.cm_grace_until(cid uuid), public.cm_join_public(cid uuid), public.cm_leave(cid uuid), public.cm_state(cid uuid), public.community_channel_id(ch text), public.community_rank(r text) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.current_merit(), public.dz_actor_key(), public.dz_add_business_days(p_from timestamp with time zone, p_days integer), public.dz_an_achievements(p_user uuid, p_scope text), public.dz_an_country(p_hint text), public.dz_an_days(p_days integer) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.dz_an_goal_progress(p_user uuid, p_metric text, p_period text, p_scope text), public.dz_an_scope(p_scope text), public.dz_an_viewer_key(p_anon_key text), public.dz_analytics_activity(p_days integer, p_scope text), public.dz_analytics_content(p_days integer, p_scope text), public.dz_analytics_overview(p_days integer, p_scope text) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.dz_analytics_reach(p_days integer, p_scope text), public.dz_analytics_track_search(p_subjects uuid[], p_term text, p_source text, p_ref text, p_device text, p_country text, p_anon_key text, p_scope text), public.dz_chat_gate(p_scope text, p_text text, p_channel text), public.dz_chat_status(), public.dz_content_fingerprint(p_text text), public.dz_deobfuscate(p_text text) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.dz_download_limit(p_tier text), public.dz_download_quota(), public.dz_fold_name(p_name text), public.dz_has_link(p_text text), public.dz_job_allowance(p_tier text), public.dz_log_abuse(p_surface text, p_rule text, p_detail text, p_sample text) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.dz_mod_token_clear(), public.dz_name_reserved(p_name text), public.dz_phish_score(p_text text), public.dz_request_download(p_artwork uuid, p_ip text), public.get_album_artworks(album uuid, lim integer, off integer), public.get_profile_engagement(p_user uuid) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.get_rank_board(board text, lim integer, off integer), public.get_rank_me(board text), public.get_top_tags(lim integer), public.get_user_albums(target uuid), public.register_artwork_download(p_artwork uuid, p_anon_key text, p_source text, p_ref text, p_device text, p_country text), public.register_artwork_view(p_artwork uuid, p_anon_key text, p_source text, p_ref text, p_device text, p_country text) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.search_artworks(q text, lim integer, off integer), public.xp_level_thresholds(), public.xp_to_level(xp integer) to PUBLIC, anon, authenticated, service_role;
grant execute on function public.dz_analytics_track(p_event text, p_subject uuid, p_scope text, p_owner uuid, p_source text, p_ref text, p_device text, p_country text, p_term text, p_anon_key text), public.dz_captcha_required(), public.dz_market_download(p_item uuid), public.dz_note_auth(p_event text, p_email text, p_ok boolean), public.dz_request_item_download(p_kind text, p_id uuid, p_ip text), public.dz_resource_file_grant(p_resource uuid, p_ip text) to anon, authenticated, service_role;
grant execute on function public.get_artist_progress(target uuid), public.get_user_bookmarked_artworks(target uuid, lim integer, off integer), public.get_user_liked_artworks(target uuid, lim integer, off integer), public.get_xp_leaderboard(lim integer), public.register_item_view(p_kind text, p_subject uuid, p_anon_key text, p_source text, p_ref text, p_device text, p_country text) to anon, authenticated, service_role;
grant execute on function public.cm_create(p_name text, p_desc text), public.cm_join(p_name text, p_code text), public.cm_kick(cid uuid, target uuid), public.cm_set_ban(cid uuid, target uuid, do_ban boolean), public.cm_set_role(cid uuid, target uuid, new_role text), public.cm_timeout(cid uuid, target uuid, minutes integer) to authenticated, service_role;
grant execute on function public.current_artist_level(), public.dz_abuse_recent(p_hours integer, p_limit integer), public.dz_admin_partners(), public.dz_admin_telemetry(), public.dz_audit_log(p_limit integer, p_before timestamp with time zone), public.dz_auth_churn(p_hours integer) to authenticated, service_role;
grant execute on function public.dz_ban_user(p_target uuid, p_reason text, p_note text, p_days integer), public.dz_claim_max(), public.dz_grant_partner(p_email text), public.dz_is_privileged(), public.dz_job_quota(), public.dz_market_file_grant(p_item uuid, p_file uuid) to authenticated, service_role;
grant execute on function public.dz_market_files(p_item uuid), public.dz_market_owned(p_items uuid[]), public.dz_market_owns(p_item uuid), public.dz_mod_find(p_query text), public.dz_my_collab_state(), public.dz_my_purchases() to authenticated, service_role;
grant execute on function public.dz_partner_ledger(p_limit integer, p_before timestamp with time zone), public.dz_partner_wallet(), public.dz_platform_revenue(), public.dz_promo_create(p_code text), public.dz_promo_mine(), public.dz_promo_resolve(p_code text, p_kind text) to authenticated, service_role;
grant execute on function public.dz_report_resolve(p_id uuid, p_status text, p_note text), public.dz_reports_queue(p_status text, p_limit integer), public.dz_revoke_partner(p_user uuid), public.dz_tax_due(), public.dz_unban_user(p_target uuid), public.dz_wallet_summary() to authenticated, service_role;
grant execute on function public.is_dev(), public.my_community_rank(cid uuid) to authenticated, service_role;
grant execute on function public.albums_cap_guard(), public.apply_merit_penalty(), public.cm_assert_can_act(cid uuid, target uuid, need integer), public.cm_member_cap(), public.dz_analytics_goal_cap(), public.dz_artwork_mod_gate() to service_role;
grant execute on function public.dz_audit(p_action text, p_target uuid, p_meta jsonb), public.dz_ban_gate(), public.dz_bounds_on_change(), public.dz_chat_gate_comments(), public.dz_chat_gate_dm(), public.dz_client_ip() to service_role;
grant execute on function public.dz_comment_community_open(), public.dz_content_guard(), public.dz_dm_guard(), public.dz_earning_apply_deductions(), public.dz_effective_tier(p_user uuid), public.dz_email_key(p_email text) to service_role;
grant execute on function public.dz_fill_comment_username(), public.dz_fy_gross(p_user uuid), public.dz_guard_identity(), public.dz_is_banned(p_user uuid), public.dz_is_ordinary(p_user uuid), public.dz_is_partner(p_user uuid) to service_role;
grant execute on function public.dz_is_staff(p_user uuid), public.dz_job_plan(p_user uuid), public.dz_job_post_gate(), public.dz_ledger_append(p_user uuid, p_type text, p_direction text, p_amount bigint, p_currency text, p_source text, p_provider_txn text, p_provider_amount bigint, p_provider_currency text, p_ref_table text, p_ref_id uuid, p_note text), public.dz_ledger_chain_ok(), public.dz_ledger_immutable() to service_role;
grant execute on function public.dz_may_moderate(p_actor uuid, p_target uuid), public.dz_partner_credit_market(), public.dz_partner_credit_sub(), public.dz_partner_reverse(), public.dz_profiles_guard_insert(), public.dz_profiles_guard_privileged() to service_role;
grant execute on function public.dz_protect_item_view_count(), public.dz_protect_social_counters(), public.dz_range_on_change(), public.dz_rate_ok(p_bucket text, p_max integer, p_window_seconds integer), public.dz_rate_take(p_bucket text, p_limit integer, p_seconds integer), public.dz_read_guard(p_name text, p_max integer, p_win integer) to service_role;
grant execute on function public.dz_reconcile(p_user uuid), public.dz_repeat_guard(), public.dz_role(p_user uuid), public.dz_section_mod_gate(), public.dz_signup_rate(), public.dz_touch_updated_at() to service_role;
grant execute on function public.dz_write_rate(), public.enforce_community_links(), public.enforce_showcase_cooldown(), public.fr_cap(), public.friendships_guard(), public.guard_profile_update() to service_role;
grant execute on function public.handle_new_user(), public.marketplace_file_cap(), public.protect_artwork_like_count(), public.protect_privileged_cols(), public.publish_due_scheduled_sections(), public.publish_due_scheduled_uploads() to service_role;
grant execute on function public.rank_scores(), public.regen_merit_daily(), public.rls_auto_enable(), public.sync_artwork_bookmark_count(), public.sync_artwork_like_count(), public.sync_profile_cred_count() to service_role;
grant execute on function public.sync_profile_username(), public.user_tag_prefs_cap_guard() to service_role;

comment on column public.artworks.description is 'Optional long-form description of the artwork, shown in the artwork modal and used for SEO/structured data. NULL for artworks uploaded before this field existed.';
comment on column public.communities.plan_backed is 'True when this community exists because its owner was on Max. It stays up for three days after the subscription lapses and is locked after that. False is a community earned with artist level 100, which no subscription can take away.';
comment on column public.fx_rates.inr_rate is 'Rupees per one major unit of this currency. Maintain as a DIRECT rate - nothing in this schema converts through a third currency any more.';
comment on column public.marketplace_earnings.fee_inr is 'Platform commission in paise, converted once at settlement. The seller''s net_amount is NOT converted and never will be.';
comment on column public.partner_commissions.payout_status is 'wallet_credited while the money is sitting here, paid_direct once a payout has carried it out. There is no pending state: this platform does not refund, so there is nothing to hold the money against.';
comment on column public.platform_tax_config.max_commission_bps is 'The platform cut on a sale by a seller whose effective tier is max, in basis points. 1000 = 10%, so the seller keeps 90%. commission_bps is the rate for everyone else.';
comment on column public.platform_tax_config.partner_market_bps is 'The promo code owner''s share of a marketplace sale, in basis points of the gross. 500 = 5%. Taken OUT OF the platform''s commission_bps, never out of the seller''s net — a seller''s share does not change because a buyer typed a code, and the trigger below refuses to write a commission that would make it change.';
comment on column public.platform_tax_config.partner_sub_bps is 'The promo code owner''s share of a Max subscription bought with their code, in basis points of the LIST price — 250 = 2.5%. The buyer pays 10% of list after promo_sub_discount_bps, so this is a quarter of what was collected.';
comment on column public.profiles.currency is 'What this member is charged in and prices their own listings in. It never converts anybody else''s price — a buyer pays the seller''s price in the seller''s currency.';
comment on column public.profiles.max_claimed is 'True once this partner has taken the free Max that comes with the role. Never reset — a partner who lets the role go and is given it again does not get a second perpetual subscription out of it.';
comment on column public.promo_codes.usage_count is 'Sales this code has earned a commission on. Incremented by the two triggers in section 7, and only when a commission row was actually written — so it always equals the number of rows in partner_commissions for this code, and a replayed webhook moves neither.';
comment on function public.cm_state(cid uuid) is 'live | grace | locked. The app asks this before opening a community; cm_join, cm_join_public, cm_browse and the comments trigger enforce it.';
comment on function public.dz_job_allowance(p_tier text) is 'Job postings a tier may publish in one plan month. Everything that is not premium or max gets 0 — including an expired plan, which reaches here as null.';
comment on function public.dz_job_plan(p_user uuid) is 'The member''s live subscription tier, how many job postings it allows, and the 31-day plan window now() falls inside. tier is null once the plan has expired, which is what makes the allowance 0.';
comment on function public.dz_job_quota() is 'The caller''s job-posting allowance for the plan month they are in. reason is auth (signed out), plan (no Premium or Max) or limit (spent).';
comment on table public.audit_log is 'Append-only. Every privileged action in this schema writes here through dz_audit(), and the actor''s role is copied onto the row rather than joined at read time — a partner demoted next month must not make last month''s ban look like it was done by a member.';
comment on table public.partner_commissions is 'A partner''s whole wallet. There is no balance column anywhere — the balance is the sum of these rows less what has been paid out, computed by dz_partner_wallet(). Two records of the same money is how they come to disagree; see the seller wallet in 20260802_money_flow.sql, which is built the same way and for the same reason.';
comment on table public.promo_codes is 'No RLS policy grants a read. A partner reads their own code through dz_promo_mine(); a buyer never reads this table at all, they type a code and dz_promo_resolve() answers yes or no. Selecting the table would list every partner''s code to every partner, which is the isolation rule this feature exists under.';
comment on table public.subscription_prices is 'Local prices per currency, in minor units (JPY in whole yen). Read by the checkout backends on the service role. Never exposed to a client, and never derived from a rate.';

insert into public.reserved_names (name, mode, reason) values
  ('admin', 'exact', 'implies the site is speaking'),
  ('administrator', 'exact', 'implies the site is speaking'),
  ('billing', 'exact', 'implies the site is speaking'),
  ('ceo', 'exact', 'implies the site is speaking'),
  ('contact', 'exact', 'implies the site is speaking'),
  ('customercare', 'exact', 'implies the site is speaking'),
  ('customerservice', 'exact', 'implies the site is speaking'),
  ('digartz', 'contains', 'transposition of the site name'),
  ('digiart', 'contains', 'one keystroke from the site itself'),
  ('digiartz', 'contains', 'the site itself'),
  ('diqiartz', 'contains', 'q-for-g homoglyph of the site name'),
  ('donotreply', 'exact', 'implies the site is speaking'),
  ('founder', 'exact', 'implies the site is speaking'),
  ('help', 'exact', 'implies the site is speaking'),
  ('helpdesk', 'exact', 'implies the site is speaking'),
  ('info', 'exact', 'implies the site is speaking'),
  ('mod', 'exact', 'implies the site is speaking'),
  ('moderator', 'exact', 'implies the site is speaking'),
  ('noreply', 'exact', 'implies the site is speaking'),
  ('official', 'exact', 'implies the site is speaking'),
  ('owner', 'exact', 'implies the site is speaking'),
  ('payment', 'exact', 'implies the site is speaking'),
  ('payments', 'exact', 'implies the site is speaking'),
  ('root', 'exact', 'implies the site is speaking'),
  ('security', 'exact', 'implies the site is speaking'),
  ('service', 'exact', 'implies the site is speaking'),
  ('staff', 'exact', 'implies the site is speaking'),
  ('support', 'exact', 'implies the site is speaking'),
  ('supportteam', 'exact', 'implies the site is speaking'),
  ('system', 'exact', 'implies the site is speaking'),
  ('team', 'exact', 'implies the site is speaking'),
  ('verification', 'exact', 'the exact noun this attack uses'),
  ('verify', 'exact', 'the exact verb this attack uses'),
  ('zeo', 'exact', 'the site assistant')
on conflict (name) do nothing;

insert into public.settlement_windows (provider, scope, days, business, label) values
  ('paypal', 'any', 5, true, 'PayPal · up to 5 business days to the bank'),
  ('razorpay', 'domestic', 2, true, 'Razorpay domestic · T+2 working days'),
  ('razorpay', 'international', 7, true, 'Razorpay international · T+7 working days')
on conflict (provider, scope) do update set days = excluded.days, business = excluded.business, label = excluded.label;

insert into public.subscription_prices (plan, currency, amount) values
  ('lite', 'AUD', 150),
  ('lite', 'CAD', 140),
  ('lite', 'CHF', 100),
  ('lite', 'EUR', 100),
  ('lite', 'GBP', 99),
  ('lite', 'HKD', 800),
  ('lite', 'INR', 9900),
  ('lite', 'JPY', 150),
  ('lite', 'NZD', 170),
  ('lite', 'SEK', 1100),
  ('lite', 'SGD', 140),
  ('lite', 'USD', 100),
  ('max', 'AUD', 1500),
  ('max', 'CAD', 1400),
  ('max', 'CHF', 900),
  ('max', 'EUR', 900),
  ('max', 'GBP', 899),
  ('max', 'HKD', 7800),
  ('max', 'INR', 89900),
  ('max', 'JPY', 1500),
  ('max', 'NZD', 1700),
  ('max', 'SEK', 10900),
  ('max', 'SGD', 1300),
  ('max', 'USD', 1000),
  ('premium', 'AUD', 750),
  ('premium', 'CAD', 700),
  ('premium', 'CHF', 450),
  ('premium', 'EUR', 500),
  ('premium', 'GBP', 449),
  ('premium', 'HKD', 3900),
  ('premium', 'INR', 44900),
  ('premium', 'JPY', 750),
  ('premium', 'NZD', 850),
  ('premium', 'SEK', 5500),
  ('premium', 'SGD', 650),
  ('premium', 'USD', 500)
on conflict (plan, currency) do update set amount = excluded.amount;

insert into public.support_limits (currency, min_amount, max_amount) values
  ('AUD', 80, 1500000),
  ('CAD', 70, 1400000),
  ('CHF', 50, 900000),
  ('EUR', 50, 900000),
  ('GBP', 50, 800000),
  ('HKD', 400, 7800000),
  ('INR', 5000, 80000000),
  ('JPY', 80, 150000000),
  ('NZD', 90, 1700000),
  ('SEK', 550, 11000000),
  ('SGD', 70, 1300000),
  ('USD', 50, 1000000)
on conflict (currency) do update set min_amount = excluded.min_amount, max_amount = excluded.max_amount;

insert into public.fx_rates (code, inr_rate) values
  ('AUD', 55.00000000),
  ('CAD', 60.83333333),
  ('CHF', 94.50000000),
  ('EUR', 90.83333333),
  ('GBP', 105.83333333),
  ('HKD', 10.68000000),
  ('INR', 1.00000000),
  ('JPY', 0.54166667),
  ('NZD', 50.00000000),
  ('SEK', 7.90000000),
  ('SGD', 61.66666667),
  ('USD', 83.33333333)
on conflict (code) do nothing;

insert into public.dz_secrets (name, value)
select 'auth_attempt_key', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.dz_secrets where name = 'auth_attempt_key');

insert into private.mod_config (id, secret)
select true, encode(extensions.gen_random_bytes(32), 'hex')
on conflict (id) do nothing;

insert into public.platform_tax_config (id) values (1) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select b.id, b.id, b.public, 419430400, array[
    'image/png','image/jpeg','image/webp','image/gif','image/avif','image/tiff','image/bmp',
    'image/vnd.adobe.photoshop','application/octet-stream','application/postscript',
    'application/zip','application/x-zip-compressed','application/x-rar-compressed',
    'application/vnd.rar','application/x-7z-compressed','application/x-tar',
    'application/gzip','application/x-gzip',
    'font/ttf','font/otf','font/woff','font/woff2','application/font-sfnt',
    'application/vnd.ms-opentype','application/x-font-ttf',
    'video/mp4','video/webm','video/quicktime','audio/mpeg','audio/wav',
    'model/gltf-binary','model/gltf+json','model/obj','model/stl']
from (values ('koe-media', true), ('koe-originals', false)) as b(id, public)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

select cron.schedule('merit-daily-regen', '10 0 * * *',
  $$select public.regen_merit_daily()$$);
select cron.schedule('publish-scheduled-uploads', '*/5 * * * *',
  $$SELECT public.publish_due_scheduled_uploads();$$);
select cron.schedule('publish-scheduled-sections', '*/5 * * * *',
  $$SELECT public.publish_due_scheduled_sections();$$);
select cron.schedule('subscription-expiry-downgrade', '20 0 * * *',
  $$UPDATE public.profiles SET subscription_tier = 'guest'
     WHERE subscription_expires_at IS NOT NULL
       AND subscription_expires_at < now()
       AND subscription_tier <> 'guest'$$);

reset check_function_bodies;
