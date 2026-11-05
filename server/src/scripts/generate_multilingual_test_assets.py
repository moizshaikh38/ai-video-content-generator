import asyncio
import os
import edge_tts
import json

output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../delete/multilingual_samples'))
os.makedirs(output_dir, exist_ok=True)

test_scenarios = [
    {
        "id": "hindi_only",
        "language": "hi",
        "voice": "hi-IN-MadhurNeural",
        "text": "नमस्ते दोस्तों, आज हम आर्टिफिशियल इंटेलिजेंस और वीडियो एडिटिंग के भविष्य के बारे में चर्चा करेंगे।",
        "description": "Pure Hindi conversational speech with Devanagari script."
    },
    {
        "id": "english_only",
        "language": "en",
        "voice": "en-US-GuyNeural",
        "text": "Welcome back everyone, today we are analyzing multimodal artificial intelligence and video production workflows.",
        "description": "Standard English technical speech."
    },
    {
        "id": "marathi_only",
        "language": "mr",
        "voice": "mr-IN-AarohiNeural",
        "text": "नमस्कार मित्रांनो, आज आपण कृत्रिम बुद्धिमत्ता आणि व्हिडिओ संपादन तंत्रज्ञानाबद्दल सविस्तर माहिती घेणार आहोत.",
        "description": "Pure Marathi speech in standard Devanagari script."
    },
    {
        "id": "hinglish_code_switch",
        "language": "hi-en",
        "voice": "hi-IN-SwaraNeural",
        "text": "नमस्ते दोस्तों, आज के इस वीडियो में हम VireoClip के नए AI clipping features को explore करेंगे, जहाँ automatic subtitles और viral highlights एक क्लिक में generate होते हैं।",
        "description": "Hindi-English code-switching (Hinglish) with technical English terms."
    },
    {
        "id": "marathi_english_code_switch",
        "language": "mr-en",
        "voice": "mr-IN-ManoharNeural",
        "text": "नमस्कार मित्रांनो, आज आपण VireoClip software वापरून video मधून best clips कसे create करायचे आणि social media वर publish कसे करायचे ते शिकणार आहोत.",
        "description": "Marathi-English code-switching common among Indian creators."
    },
    {
        "id": "rapid_intra_sentence_switch",
        "language": "hi-mr-en",
        "voice": "hi-IN-MadhurNeural",
        "text": "अगर आप content create करते हैं तो consistent workflow, proper editing और high retention बहुत important है, आणि जर तुम्ही daily upload कराल तर growth नक्की होईल।",
        "description": "Rapid intra-sentence code-switching across Hindi, Marathi, and English."
    }
]

async def generate_all():
    manifest = []
    print(f"Generating 6 genuine multilingual speech assets in {output_dir}...")
    for item in test_scenarios:
        out_file = os.path.join(output_dir, f"{item['id']}.mp3")
        print(f"Synthesizing [{item['id']}] using voice {item['voice']}...")
        communicate = edge_tts.Communicate(item["text"], item["voice"])
        await communicate.save(out_file)
        file_size = os.path.getsize(out_file)
        manifest.append({
            "id": item["id"],
            "language": item["language"],
            "voice": item["voice"],
            "filePath": out_file,
            "fileSizeBytes": file_size,
            "groundTruth": item["text"],
            "description": item["description"]
        })
        print(f"  -> Generated {out_file} ({file_size} bytes)")
    
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"Saved manifest to {manifest_path}")

if __name__ == "__main__":
    asyncio.run(generate_all())

