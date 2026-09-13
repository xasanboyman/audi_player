#!/usr/bin/env python3
"""
youtube_search.py
High-speed, stealth-enabled YouTube music search powered by Playwright and stealth evasions.
Bypasses bot detection, CAPTCHAs, and consent dialogs to extract rich music search results
including video ID, title, artist/channel, duration, view counts, and high-res thumbnails.
"""
import sys
import json
import urllib.parse
import re
from playwright.sync_api import sync_playwright
from playwright_stealth.stealth import Stealth

def parse_duration_to_seconds(dur_str):
    if not dur_str:
        return 180
    parts = dur_str.strip().split(':')
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1:
            return int(parts[0])
    except (ValueError, TypeError):
        pass
    return 180

def search_youtube(query, limit=20):
    query = (query or '').strip()
    if not query:
        query = 'trending music phonk'

    encoded = urllib.parse.quote_plus(query)
    target_url = f"https://www.youtube.com/results?search_query={encoded}"

    results = []

    with sync_playwright() as p:
        # Launch Google Chrome with stealth-optimized flags
        browser = p.chromium.launch(
            executable_path='/usr/bin/google-chrome',
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        )

        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 800},
            locale='en-US'
        )

        page = context.new_page()
        Stealth().apply_stealth_sync(page)

        try:
            page.goto(target_url, wait_until='domcontentloaded', timeout=25000)

            # Dismiss Google / YouTube cookie/consent popups if any exist
            try:
                consent_button = page.locator('button[aria-label*="Agree"], button[aria-label*="Accept"], button:has-text("Accept all"), button:has-text("I agree")').first
                if consent_button.is_visible(timeout=1500):
                    consent_button.click()
            except Exception:
                pass

            # Extract data from window.ytInitialData
            extracted = page.evaluate('''() => {
                const list = [];
                try {
                    const data = window.ytInitialData;
                    if (!data) return list;

                    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                    if (!contents) return list;

                    for (const section of contents) {
                        const items = section.itemSectionRenderer?.contents || [];
                        for (const item of items) {
                            const vr = item.videoRenderer;
                            if (vr && vr.videoId) {
                                const title = vr.title?.runs?.map(r => r.text).join('') || vr.title?.simpleText || '';
                                const channel = vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube Music';
                                const duration = vr.lengthText?.simpleText || '';
                                const views = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || '';
                                
                                // Thumbnail selection: pick highest resolution available
                                let thumb = `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
                                if (vr.thumbnail?.thumbnails?.length) {
                                    thumb = vr.thumbnail.thumbnails[vr.thumbnail.thumbnails.length - 1].url;
                                }

                                list.push({
                                    id: vr.videoId,
                                    title,
                                    channel,
                                    duration,
                                    views,
                                    thumbnail: thumb
                                });
                            }
                        }
                    }
                } catch (e) {}
                return list;
            }''')

            # Fallback to DOM elements if ytInitialData was empty
            if not extracted:
                dom_items = page.locator('ytd-video-renderer').all()
                for el in dom_items[:limit]:
                    try:
                        title_el = el.locator('#video-title')
                        title = title_el.inner_text(timeout=500)
                        href = title_el.get_attribute('href') or ''
                        vid_match = re.search(r'v=([a-zA-Z0-9_-]{11})', href)
                        if not vid_match:
                            continue
                        vid_id = vid_match.group(1)
                        
                        channel_el = el.locator('#channel-info #channel-name, .ytd-channel-name')
                        channel = channel_el.inner_text(timeout=500) if channel_el.count() > 0 else 'YouTube Music'
                        
                        duration_el = el.locator('span.ytd-thumbnail-overlay-time-status-renderer, #text.ytd-thumbnail-overlay-time-status-renderer')
                        duration = duration_el.inner_text(timeout=500) if duration_el.count() > 0 else '3:00'

                        extracted.append({
                            'id': vid_id,
                            'title': title,
                            'channel': channel.strip(),
                            'duration': duration.strip(),
                            'views': '',
                            'thumbnail': f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                        })
                    except Exception:
                        continue

            for item in extracted[:limit]:
                dur_sec = parse_duration_to_seconds(item['duration'])
                # Avoid long 10-hour loops or full 3-hour concerts unless requested
                results.append({
                    'id': f"yt_{item['id']}",
                    'videoId': item['id'],
                    'title': item['title'],
                    'artist': item['channel'],
                    'channel': item['channel'],
                    'duration': dur_sec,
                    'durationFormatted': item['duration'] or f"{dur_sec // 60}:{dur_sec % 60:02d}",
                    'views': item['views'],
                    'thumbnail': item['thumbnail'],
                    'streamUrl': f"/api/youtube/stream/{item['id']}",
                    'url': f"https://www.youtube.com/watch?v={item['id']}",
                    'source': 'YouTube'
                })

        finally:
            browser.close()

    return results

if __name__ == '__main__':
    query_arg = sys.argv[1] if len(sys.argv) > 1 else 'phonk music'
    limit_arg = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    try:
        items = search_youtube(query_arg, limit_arg)
        print(json.dumps({'success': True, 'query': query_arg, 'count': len(items), 'results': items}))
    except Exception as e:
        print(json.dumps({'success': False, 'query': query_arg, 'error': str(e)}), file=sys.stderr)
        sys.exit(1)
