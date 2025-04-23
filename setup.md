Backend Setup:
Navigate to the python_backend directory in your terminal.
Create the .env file and add your API keys.
Install dependencies: pip install -r requirements.txt

Replace "YOUR_CHROME_EXTENSION_ID_HERE" in python_backend/main.py with your actual extension ID (find it in chrome://extensions/).

Run the backend server: uvicorn main:app --reload --port 8000
Frontend Setup:
Make sure all the modified JavaScript files and the updated manifest.json and popup.html are in your extension's directory structure.
Load/Reload the extension in Chrome (chrome://extensions/).
Usage: Open the extension popup. The JavaScript frontend will now communicate with your running Python backend on http://127.0.0.1:8000.