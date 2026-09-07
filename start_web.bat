@echo off
chcp 65001 > nul
echo ====================================================
echo      DialDoodle - 旋转解密绘图盘生成器
echo ====================================================
echo 正在启动本地服务...
start "" "http://localhost:8000"
python -m http.server 8000
pause
