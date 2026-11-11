// =============================================================================
// types.ts — shared types for the arxys API
// =============================================================================

export type Bindings = {
  DB:             D1Database
  RESEND_API_KEY: string
  RESEND_DOMAIN:  string
}

export type Variables = {
  member:         { id: string; display_name: string }
  workspace:      {
    id: string; venture_id: string; display_name: string
    github_repo: string; board_type: 'notion' | 'github' | 'both'
    notion_api_key: string | null
    notion_database_id: string | null
    github_project_id: string | null
    slack_channel_id: string | null
  }
  venture:        {
    id: string
    slack_bot_token: string | null; slack_channel_id: string | null
  }
  ventureMember:  {
    venture_role: string; github_pat: string
    notion_user: string | null; email: string | null
  }
  workspaceRole:  string
  adminMemberId:  string
  credentials:    Credentials
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}

export type Credentials = {
  notionApiKey:     string | null
  notionDatabaseId: string | null
  notionUser:       string
  notionUserEmail:  string | null
  githubToken:      string
  githubProjectId:  string | null
  slackBotToken:    string | null
  slackChannelId:   string | null
}

export const NOTION_VERSION  = '2022-06-28'
export const NOTION_BASE     = 'https://api.notion.com/v1'
export const GITHUB_BASE     = 'https://api.github.com'
export const GITHUB_GRAPHQL  = 'https://api.github.com/graphql'
