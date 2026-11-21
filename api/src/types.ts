// =============================================================================
// types.ts — shared types for the arxys API
// =============================================================================

export type Bindings = {
  DB:                     D1Database
  RESEND_API_KEY:         string
  RESEND_DOMAIN:          string
  GH_APP_ID:          string
  GH_APP_PRIVATE_KEY: string
}

export type Variables = {
  member:         { id: string; display_name: string }
  workspace:      {
    id: string; venture_id: string; display_name: string
    github_repo: string
    notion_api_key: string | null
    notion_database_id: string | null
    github_project_id: string | null
    slack_channel_id: string | null
  }
  venture:        {
    id: string
    slack_bot_token: string | null; slack_channel_id: string | null
    github_org: string | null
    github_app_installation_id: string | null
  }
  ventureMember:  {
    venture_role: string; github_pat: string | null; github_login: string | null
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
  githubLogin:      string | null   // member's GitHub login — used for ?mine=1 with App tokens
  githubProjectId:  string | null
  slackBotToken:    string | null
  slackChannelId:   string | null
}

export const NOTION_VERSION  = '2022-06-28'
export const NOTION_BASE     = 'https://api.notion.com/v1'
export const GITHUB_BASE     = 'https://api.github.com'
export const GITHUB_GRAPHQL  = 'https://api.github.com/graphql'
