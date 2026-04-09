@echo off
echo Starting Redis Native...
start cmd /k "cd backend\redis-windows && redis-server.exe"
timeout /t 2

echo Starting Celery Worker...
start cmd /k "cd backend && venv\Scripts\activate && celery -A tasks worker --loglevel=info --pool=solo"
timeout /t 2

echo Starting FastAPI Server...
start cmd /k "cd backend && venv\Scripts\activate && uvicorn server:app --reload --port 8001"
