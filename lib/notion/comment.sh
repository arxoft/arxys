#!/usr/bin/env bash
# =============================================================================
# lib/notion/comment.sh — comment subcommands
# Requires: lib/common.sh sourced first.
# =============================================================================

cmd_comment_add() {
  local no="$1" text="$2" page_id="${3:-}"
  [[ -z "$text" ]] && die "Comment text cannot be empty."

  # Prepend acting user's name if NOTION_USER is set in .env.notion
  if [[ -n "${NOTION_USER:-}" ]]; then
    text="(${NOTION_USER}) ${text}"
  fi

  if [[ -z "$page_id" ]]; then
    info "Fetching task No. ${no}..."
    page_id=$(resolve_page_id "$no")
  fi

  local rich_text_json
  rich_text_json=$(python3 -c "
import re, json, sys

def parse(text):
    token_re = re.compile(
        r'\*\*(\`?)(.+?)\1\*\*'
        r'|~~(.+?)~~'
        r'|(?<!\w)_(.+?)_(?!\w)'
        r'|\*([^\*\s][^\*]*?[^\*\s]|[^\*\s])\*'
        r'|\`([^\`]+)\`'
        r'|\[([^\]]+)\]\((https?://[^\)]+)\)'
        r'|(https?://\S+)'
        r'|([^\*\`~\[]+)'
        r'|(.)'
    )
    ann = {'bold': False, 'italic': False, 'code': False,
           'strikethrough': False, 'underline': False, 'color': 'default'}
    segments = []
    for m in token_re.finditer(text):
        bold_tick, bold_content, strike, u_italic, star_italic, \
            code, md_label, md_url, url, plain, catch = m.groups()
        if bold_content is not None:
            segments.append({'type': 'text', 'text': {'content': bold_content},
                'annotations': {**ann, 'bold': True, 'code': bool(bold_tick)}})
        elif strike is not None:
            segments.append({'type': 'text', 'text': {'content': strike},
                'annotations': {**ann, 'strikethrough': True}})
        elif u_italic is not None or star_italic is not None:
            segments.append({'type': 'text', 'text': {'content': u_italic or star_italic},
                'annotations': {**ann, 'italic': True}})
        elif code is not None:
            segments.append({'type': 'text', 'text': {'content': code},
                'annotations': {**ann, 'code': True}})
        elif md_label is not None and md_url is not None:
            segments.append({'type': 'text',
                'text': {'content': md_label, 'link': {'url': md_url}},
                'annotations': {**ann}})
        elif url is not None:
            segments.append({'type': 'text',
                'text': {'content': url, 'link': {'url': url}},
                'annotations': {**ann}})
        elif plain is not None or catch is not None:
            chunk = plain if plain is not None else catch
            url_re = re.compile(r'(https?://\S+)')
            for part in url_re.split(chunk):
                if not part: continue
                is_url = bool(url_re.fullmatch(part))
                segments.append({'type': 'text',
                    'text': {'content': part, **(({'link': {'url': part}}) if is_url else {})},
                    'annotations': {**ann}})
    return segments

print(json.dumps(parse(sys.argv[1])))
" "$text")

  local body result cid
  body=$(jq -n --arg pid "$page_id" --argjson rt "$rich_text_json" \
    '{parent: {page_id: $pid}, rich_text: $rt}')

  result=$(notion_post "/comments" "$body")
  cid=$(echo "$result" | jq -r '.id')
  green "✓ Comment added to task No. ${no} (id: ${cid})"
}
