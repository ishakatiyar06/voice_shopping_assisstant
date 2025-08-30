# Shopping Assistant – Voice Powered Smart Cart

A **minimalist, voice-driven shopping assistant** that helps users manage their grocery list effortlessly using natural language commands and AI-enhanced product recognition.

---
## Website URL :- https://voice-shopping-assisstant.onrender.com/

## Features

- **Voice-Powered Input**: Add, remove, and manage items with simple voice commands.
- **Multilingual Support**: Understands multiple languages using Hugging Face translation APIs.
- **Natural Language Understanding**: Interpret phrases like “add three chocolates” or “remove milk.”
- **AI Product Recognition**: Dynamically estimates prices and creates entries for unknown items.
- **Real-Time Feedback**: Displays recognized items, prices, total cost, and quick suggestions.
- **Quick Suggestions**: Frequently bought items and seasonal recommendations.
- **Lightweight & Mobile-Friendly**: Optimized for mobile devices with a minimalist interface.
- **Reliable**: Fallback mechanisms and local NLP parsing ensure usability even without API connectivity.

---

## Tech Stack

- **Frontend**: HTML, CSS, Vanilla JS (mobile-optimized, minimalist interface)
- **Backend**: Node.js, Express
- **AI/NLP**: Hugging Face APIs (translation, intent extraction)
- **Deployment**: Render, Vercel, Firebase Hosting
- **Other**: Local NLP fallback, dynamic price estimation for unknown items

---

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/shopping-assistant.git
cd shopping-assistant
```
## Create a .env file in the backend directory with your API keys:

HUGGING_FACE_API_KEY=your_api_key
