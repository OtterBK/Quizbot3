#!/bin/bash

sudo -u postgres psql -d quizbot3 -c "UPDATE quizbot.tb_quiz_info SET played_count_of_week = 0";

