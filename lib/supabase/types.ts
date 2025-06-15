export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          username: string | null
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          name: string
          section: number
          title: string
          description: string | null
          content: Json
          search_content: string
          category: string | null
          is_common: boolean
          priority: number
          access_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          section: number
          title: string
          description?: string | null
          content: Json
          search_content: string
          category?: string | null
          is_common?: boolean
          priority?: number
          access_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          section?: number
          title?: string
          description?: string | null
          content?: Json
          search_content?: string
          category?: string | null
          is_common?: boolean
          priority?: number
          access_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      user_history: {
        Row: {
          id: string
          user_id: string
          document_id: string
          accessed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id: string
          accessed_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string
          accessed_at?: string
        }
      }
      user_favorites: {
        Row: {
          id: string
          user_id: string
          document_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string
          created_at?: string
        }
      }
      analytics: {
        Row: {
          id: string
          event_type: string
          user_id: string | null
          document_id: string | null
          search_query: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          event_type: string
          user_id?: string | null
          document_id?: string | null
          search_query?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          event_type?: string
          user_id?: string | null
          document_id?: string | null
          search_query?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      popular_documents: {
        Row: {
          id: string
          name: string
          section: number
          title: string
          description: string | null
          access_count: number
          category: string | null
        }
      }
    }
    Functions: {
      increment_access_count: {
        Args: {
          doc_id: string
        }
        Returns: void
      }
      search_documents: {
        Args: {
          search_query: string
          section_filter?: number
          limit_count?: number
        }
        Returns: {
          id: string
          name: string
          section: number
          title: string
          description: string | null
          rank: number
        }[]
      }
    }
    Enums: {
      event_type: 'page_view' | 'search' | 'click' | 'favorite' | 'share'
    }
  }
}