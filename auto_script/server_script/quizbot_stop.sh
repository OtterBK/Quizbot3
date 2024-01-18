echo "stopping quizbot"

pkill -f ".*quizbot_start.sh.*"
echo "stopped start script";

pkill -f 'node.*index.js'; 
echo "killed index.js"

pkill -f 'node.*bot.js'; 
echo "killed bot.js"

pkill -f ".*ffmpeg.*";
echo "killed all ffmpeg"

echo "stopped"
