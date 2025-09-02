# TAPS
Time Attendance Payroll System
Install Dependencies: 
>    cd frontend/
>    npm i

>    cd backend/
>    npm i

You will also need to install mongodb database for the app to run properly.

Run App in dev mode:
>    cd frontend/
>    npm run dev

>    cd backend/
>    npm run dev

Monitor app status in prod server:

    Backend process(check if "index" is online):
    >    pm2 list 

    Check if nginx server is running(This server serves the front-end and acts as a proxy for backend):
    >    sudo systemctl status nginx
    
    Check if MongoDB Database Server is running:
    >    sudo systemctl status mongod
