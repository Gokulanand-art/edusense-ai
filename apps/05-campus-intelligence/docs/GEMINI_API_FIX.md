# 🔧 GEMINI API KEY - QUOTA EXCEEDED FIX

## The Problem
The API key currently in `.env` is a **free tier key** that has **exceeded its quota**.

**Error Details:**
```
429 You exceeded your current quota, please check your plan and billing details

Quotas exceeded:
- generate_content_free_tier_input_token_count (limit: 0)
- generate_content_free_tier_requests (limit: 0)
```

The free tier has very strict limits:
- ~60 requests per day
- ~60k tokens per day
- Low per-minute limits

## ✅ Solution: Get a Paid API Key

### Step 1: Go to Google AI Studio
https://ai.google.dev/

### Step 2: Create/Get Your API Key
- Click "Get API Key" 
- Create a new project or select existing
- Generate an API key

### Step 3: **CRITICAL - Enable Billing**
⚠️ **This is the most important step!**

Go to: https://console.cloud.google.com/billing

1. Click on your project
2. Add a **payment method** (credit card)
3. Enable billing for the project
4. Wait ~5 minutes for billing to activate

### Step 4: Update `.env`

Open `.env` and replace the API key:

```env
# OLD (free tier - quota exceeded)
# GEMINI_API_KEY=AIzaSyAfHGNYPw9qvQFhOCItRyr0btBytkY64RA

# NEW (paid tier - replace with your key)
GEMINI_API_KEY=your-new-api-key-here
```

### Step 5: Restart Flask App

```bash
# Stop the current Flask app (Ctrl+C)
# Then start it again
python app.py
```

## 📊 Paid Tier Limits

Once billing is enabled, you get **much higher limits**:
- ✅ 1,500,000 input tokens per minute
- ✅ 50,000 requests per minute  
- ✅ 1,500,000 output tokens per minute

**Cost:** Charges only for what you use
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

For a campus app with students, this is very affordable (usually <$1/month).

## 🧪 Testing Your New Key

After updating, you can verify with:

```python
import google.generativeai as genai

genai.configure(api_key="your-new-key")
model = genai.GenerativeModel("gemini-2.0-flash")
response = model.generate_content("Say hello")
print(response.text)
```

## ⏱️ Temporary Workaround (if waiting for billing)

The quota will reset daily at midnight UTC. The error showed:
```
Please retry in 49.887009249s
```

So waiting ~50 seconds would allow 1 more free tier request.

**But this is not sustainable.** Get a paid key for proper development.

## 🚀 After You Update the Key

The AI will start working for:
- ✅ Students asking for study advice
- ✅ Faculty getting class insights
- ✅ Student summaries
- ✅ Quick prompts

---

**Questions?**
- Gemini API docs: https://ai.google.dev/docs
- Pricing: https://ai.google.dev/pricing
- Quota info: https://ai.google.dev/gemini-api/docs/rate-limits
