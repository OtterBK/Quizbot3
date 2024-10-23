--
-- PostgreSQL database dump
--

-- Dumped from database version 14.13 (Ubuntu 14.13-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.13 (Ubuntu 14.13-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: quizbot; Type: SCHEMA; Schema: -; Owner: quizbot
--

CREATE SCHEMA quizbot;


ALTER SCHEMA quizbot OWNER TO quizbot;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: tb_ban_history; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_ban_history (
    user_id bigint NOT NULL,
    ban_count integer,
    ban_expiration_timestamp bigint
);


ALTER TABLE quizbot.tb_ban_history OWNER TO quizbot;

--
-- Name: tb_chat_info; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_chat_info (
    chat_id character varying NOT NULL,
    content character varying,
    sender_id bigint,
    result integer DEFAULT 0
);


ALTER TABLE quizbot.tb_chat_info OWNER TO quizbot;

--
-- Name: tb_global_scoreboard; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_global_scoreboard (
    guild_id bigint NOT NULL,
    win integer,
    lose integer,
    play integer,
    mmr integer,
    guild_name character varying
);


ALTER TABLE quizbot.tb_global_scoreboard OWNER TO quizbot;

--
-- Name: tb_like_info; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_like_info (
    quiz_id integer NOT NULL,
    guild_id bigint NOT NULL,
    user_id bigint NOT NULL
);


ALTER TABLE quizbot.tb_like_info OWNER TO quizbot;

--
-- Name: tb_option; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_option (
    guild_id bigint NOT NULL,
    audio_play_time integer,
    hint_type character(16),
    skip_type character(16),
    use_similar_answer character(16),
    score_type character(16),
    score_show_max integer,
    improved_audio_cut character(16),
    use_message_intent character(16),
    max_chance integer DEFAULT '-1'::integer
);


ALTER TABLE quizbot.tb_option OWNER TO quizbot;

--
-- Name: tb_question_info; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_question_info (
    question_id integer NOT NULL,
    quiz_id integer NOT NULL,
    question_audio_url character varying(500),
    answers character varying(200) NOT NULL,
    hint character varying(500),
    audio_start integer,
    audio_end integer,
    audio_play_time integer,
    question_image_url character varying(1000),
    question_text character varying(500),
    answer_audio_url character varying(500),
    answer_image_url character varying(1000),
    answer_text character varying(500),
    use_answer_timer boolean DEFAULT false,
    audio_range_row character varying(100),
    answer_audio_start integer,
    answer_audio_end integer,
    answer_audio_play_time integer,
    answer_audio_range_row character varying(100),
    hint_image_url character varying(1000),
    answer_type integer DEFAULT 1
);


ALTER TABLE quizbot.tb_question_info OWNER TO quizbot;

--
-- Name: tb_question_info_question_id_seq1; Type: SEQUENCE; Schema: quizbot; Owner: quizbot
--

CREATE SEQUENCE quizbot.tb_question_info_question_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE quizbot.tb_question_info_question_id_seq1 OWNER TO quizbot;

--
-- Name: tb_question_info_question_id_seq1; Type: SEQUENCE OWNED BY; Schema: quizbot; Owner: quizbot
--

ALTER SEQUENCE quizbot.tb_question_info_question_id_seq1 OWNED BY quizbot.tb_question_info.question_id;


--
-- Name: tb_quiz_info; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_quiz_info (
    quiz_id integer NOT NULL,
    creator_id character varying NOT NULL,
    creator_name character varying(50),
    creator_icon_url character varying(300),
    quiz_title character varying(50) NOT NULL,
    thumbnail character varying(1000),
    simple_description character varying(60),
    description character varying(500),
    winner_nickname character varying(50),
    birthtime timestamp without time zone NOT NULL,
    modified_time timestamp without time zone,
    played_count integer DEFAULT 0,
    is_private boolean DEFAULT true,
    is_use boolean DEFAULT true,
    played_count_of_week integer DEFAULT 0,
    tags_value integer DEFAULT 0,
    certified boolean DEFAULT false,
    like_count integer DEFAULT 0
);


ALTER TABLE quizbot.tb_quiz_info OWNER TO quizbot;

--
-- Name: tb_quiz_info_quiz_id_seq; Type: SEQUENCE; Schema: quizbot; Owner: quizbot
--

CREATE SEQUENCE quizbot.tb_quiz_info_quiz_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE quizbot.tb_quiz_info_quiz_id_seq OWNER TO quizbot;

--
-- Name: tb_quiz_info_quiz_id_seq; Type: SEQUENCE OWNED BY; Schema: quizbot; Owner: quizbot
--

ALTER SEQUENCE quizbot.tb_quiz_info_quiz_id_seq OWNED BY quizbot.tb_quiz_info.quiz_id;


--
-- Name: tb_report_info; Type: TABLE; Schema: quizbot; Owner: quizbot
--

CREATE TABLE quizbot.tb_report_info (
    target_id character varying,
    reporter_id bigint,
    report_detail character varying,
    report_type integer DEFAULT 0
);


ALTER TABLE quizbot.tb_report_info OWNER TO quizbot;

--
-- Name: tb_question_info question_id; Type: DEFAULT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_question_info ALTER COLUMN question_id SET DEFAULT nextval('quizbot.tb_question_info_question_id_seq1'::regclass);


--
-- Name: tb_quiz_info quiz_id; Type: DEFAULT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_quiz_info ALTER COLUMN quiz_id SET DEFAULT nextval('quizbot.tb_quiz_info_quiz_id_seq'::regclass);


--
-- Data for Name: tb_ban_history; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_ban_history (user_id, ban_count, ban_expiration_timestamp) FROM stdin;
\.


--
-- Data for Name: tb_chat_info; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_chat_info (chat_id, content, sender_id, result) FROM stdin;
\.


--
-- Data for Name: tb_global_scoreboard; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_global_scoreboard (guild_id, win, lose, play, mmr, guild_name) FROM stdin;
\.


--
-- Data for Name: tb_like_info; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_like_info (quiz_id, guild_id, user_id) FROM stdin;
\.


--
-- Data for Name: tb_option; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_option (guild_id, audio_play_time, hint_type, skip_type, use_similar_answer, score_type, score_show_max, improved_audio_cut, use_message_intent, max_chance) FROM stdin;
\.


--
-- Data for Name: tb_question_info; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_question_info (question_id, quiz_id, question_audio_url, answers, hint, audio_start, audio_end, audio_play_time, question_image_url, question_text, answer_audio_url, answer_image_url, answer_text, use_answer_timer, audio_range_row, answer_audio_start, answer_audio_end, answer_audio_play_time, answer_audio_range_row, hint_image_url, answer_type) FROM stdin;
\.


--
-- Data for Name: tb_quiz_info; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_quiz_info (quiz_id, creator_id, creator_name, creator_icon_url, quiz_title, thumbnail, simple_description, description, winner_nickname, birthtime, modified_time, played_count, is_private, is_use, played_count_of_week, tags_value, certified, like_count) FROM stdin;
\.


--
-- Data for Name: tb_report_info; Type: TABLE DATA; Schema: quizbot; Owner: quizbot
--

COPY quizbot.tb_report_info (target_id, reporter_id, report_detail, report_type) FROM stdin;
\.


--
-- Name: tb_question_info_question_id_seq1; Type: SEQUENCE SET; Schema: quizbot; Owner: quizbot
--

SELECT pg_catalog.setval('quizbot.tb_question_info_question_id_seq1', 92624, true);


--
-- Name: tb_quiz_info_quiz_id_seq; Type: SEQUENCE SET; Schema: quizbot; Owner: quizbot
--

SELECT pg_catalog.setval('quizbot.tb_quiz_info_quiz_id_seq', 3952, true);


--
-- Name: tb_ban_history tb_ban_history_pkey; Type: CONSTRAINT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_ban_history
    ADD CONSTRAINT tb_ban_history_pkey PRIMARY KEY (user_id);


--
-- Name: tb_chat_info tb_chat_info_pkey; Type: CONSTRAINT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_chat_info
    ADD CONSTRAINT tb_chat_info_pkey PRIMARY KEY (chat_id);


--
-- Name: tb_global_scoreboard tb_global_scoreboard_pkey; Type: CONSTRAINT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_global_scoreboard
    ADD CONSTRAINT tb_global_scoreboard_pkey PRIMARY KEY (guild_id);


--
-- Name: tb_like_info tb_like_info_pkey; Type: CONSTRAINT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_like_info
    ADD CONSTRAINT tb_like_info_pkey PRIMARY KEY (quiz_id, guild_id, user_id);


--
-- Name: tb_option tb_option_pkey; Type: CONSTRAINT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_option
    ADD CONSTRAINT tb_option_pkey PRIMARY KEY (guild_id);


--
-- Name: tb_question_info tb_question_info_pkey1; Type: CONSTRAINT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_question_info
    ADD CONSTRAINT tb_question_info_pkey1 PRIMARY KEY (question_id);


--
-- Name: tb_quiz_info tb_quiz_info_pkey; Type: CONSTRAINT; Schema: quizbot; Owner: quizbot
--

ALTER TABLE ONLY quizbot.tb_quiz_info
    ADD CONSTRAINT tb_quiz_info_pkey PRIMARY KEY (quiz_id);


--
-- Name: idx_quiz_like_user; Type: INDEX; Schema: quizbot; Owner: quizbot
--

CREATE INDEX idx_quiz_like_user ON quizbot.tb_like_info USING btree (quiz_id, user_id);


--
-- PostgreSQL database dump complete
--

