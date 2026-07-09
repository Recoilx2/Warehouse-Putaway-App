import os
import sys
import configparser
import base64
import pandas as pd
import cv2
from openai import OpenAI
from rapidfuzz import process, fuzz

def initialize_application():
    if getattr(sys, 'frozen', False):
        BASE_DIR = os.path.dirname(sys.executable)
    else:
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    config_path = os.path.join(BASE_DIR, "config.ini")
    if not os.path.exists(config_path):
        print(f"CRITICAL ERROR: config.ini missing at {config_path}")
        sys.exit(1)
        
    config = configparser.ConfigParser()
    config.read(config_path)

    master_relative = config['EXCEL_PATHS']['master_lookup_path']
    master_absolute = os.path.normpath(os.path.join(BASE_DIR, master_relative))
    
    try:
        master_df = pd.read_excel(
            master_absolute, 
            sheet_name="Custom Item and Location List",
            usecols="A,C"
        )
        master_df.columns = ['description', 'location']
        master_df = master_df.dropna(subset=['description', 'location'])
        # Strip string whitespace to make matching cleaner
        master_df['description'] = master_df['description'].astype(str).str.strip()
        print(f"Warehouse Master List cached ({len(master_df)} rows).")
        return master_df, config, BASE_DIR
    except Exception as e:
        print(f"DATABASE ERROR: {e}")
        sys.exit(1)

def extract_text_via_ai(frame, config):
    """Encodes frame to Base64 and sends it to the OpenAI-compatible Vision API."""
    try:
        # 1. Encode frame to JPEG memory buffer, then convert to Base64 string
        _, buffer = cv2.imencode('.jpg', frame)
        base64_image = base64.b64encode(buffer).decode('utf-8')
        
        # 2. Instantiate OpenAI Client from config
        client = OpenAI(
            api_key=config['AI_CONFIG']['api_key'],
            base_url=config['AI_CONFIG']['base_url']
        )
        
        # 3. Request OCR extraction from the image payload
        response = client.chat.completions.create(
            model=config['AI_CONFIG']['model_name'],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Read the text on this warehouse label/ticket. Extract and return only the raw alphanumeric product identifiers, descriptions, or short codes you see. Do not add intro text, conversational words, or pleasantries."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]
                }
            ],
            max_tokens=100
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"AI EXTRACTION ERROR: {e}")
        return None

def run_matching_workflow(master_df, config):
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("CAMERA ERROR: Could not open video device.")
        return

    print("\n--- App Standby. Press 'Space' to capture and match, or 'Esc' to quit. ---")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        cv2.imshow("Yeti Put-Away Scanner", frame)
        key = cv2.waitKey(1) & 0xFF
        
        if key == 27:  # Esc
            break
        elif key == 32:  # Spacebar
            print("\n[Trigger] Capturing frame... sending to cloud AI...")
            
            # Step 1: Call Cloud Vision API
            extracted_text = extract_text_via_ai(frame, config)
            if not extracted_text:
                print("Failed to get text from label.")
                continue
                
            print(f"AI Extracted Text: '{extracted_text}'")
            
            # Step 2: Use RapidFuzz to match text against cached Master list descriptions
            # extractOne finds the single best match in the array
            match_result = process.extractOne(
                extracted_text, 
                master_df['description'].tolist(),
                scorer=fuzz.token_set_ratio # Best scorer for handling unstandardized word ordering
            )
            
            if match_result:
                best_match_str, confidence_score, index = match_result
                
                # Fetch corresponding bin location from the dataframe using the index match
                matched_row = master_df.iloc[index]
                bin_location = matched_row['location']
                
                print(f"--- MATCH FOUND (Confidence: {confidence_score:.1f}%) ---")
                print(f"Spreadsheet Item: {best_match_str}")
                print(f"Target Bin Location: {bin_location}")
                
                # Strict Gatekeeper Threshold Filter
                if confidence_score < 75.0:
                    print("⚠️ WARNING: Match confidence is low. Potential mismatch or unrelated item!")
            else:
                print("❌ No matching item found within inventory constraints.")
                
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    master_data, app_config, base_path = initialize_application()
    run_matching_workflow(master_data, app_config)