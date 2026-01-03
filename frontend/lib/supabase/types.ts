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
      documents: {
        Row: {
          id: number
          name: string
          section: number
          title: string
          description: string
          synopsis: string
          content: string
          category: string
          is_common: boolean
          complexity: 'basic' | 'intermediate' | 'advanced'
          keywords: string[]
          see_also: Json
          related_commands: string[]
          examples: Json
          options: Json
          search_content: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          section: number
          title: string
          description: string
          synopsis: string
          content: string
          category: string
          is_common?: boolean
          complexity?: 'basic' | 'intermediate' | 'advanced'
          keywords?: string[]
          see_also?: Json
          related_commands?: string[]
          examples?: Json
          options?: Json
          search_content?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          section?: number
          title?: string
          description?: string
          synopsis?: string
          content?: string
          category?: string
          is_common?: boolean
          complexity?: 'basic' | 'intermediate' | 'advanced'
          keywords?: string[]
          see_also?: Json
          related_commands?: string[]
          examples?: Json
          options?: Json
          search_content?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      search_history: {
        Row: {
          id: number
          query: string
          results_count: number
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          query: string
          results_count: number
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          query?: string
          results_count?: number
          user_id?: string | null
          created_at?: string
        }
      }
      view_history: {
        Row: {
          id: number
          document_id: number
          user_id: string | null
          viewed_at: string
        }
        Insert: {
          id?: number
          document_id: number
          user_id?: string | null
          viewed_at?: string
        }
        Update: {
          id?: number
          document_id?: number
          user_id?: string | null
          viewed_at?: string
        }
      }
      favorites: {
        Row: {
          id: number
          document_id: number
          user_id: string
          created_at: string
        }
        Insert: {
          id?: number
          document_id: number
          user_id: string
          created_at?: string
        }
        Update: {
          id?: number
          document_id?: number
          user_id?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_documents: {
        Args: {
          search_query: string
        }
        Returns: {
          id: number
          name: string
          section: number
          title: string
          description: string
          category: string
          is_common: boolean
          rank: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}