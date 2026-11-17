export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      afirmacion: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          id: string
          orden: number
          organizacion_id: string
          registros: string[]
          sintesis_id: string
          texto: string
          version: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          id?: string
          orden: number
          organizacion_id: string
          registros: string[]
          sintesis_id: string
          texto: string
          version: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          id?: string
          orden?: number
          organizacion_id?: string
          registros?: string[]
          sintesis_id?: string
          texto?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "afirmacion_encargo_id_sintesis_id_fkey"
            columns: ["encargo_id", "sintesis_id"]
            isOneToOne: false
            referencedRelation: "sintesis"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "afirmacion_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      alerta: {
        Row: {
          creado_en: string
          creado_por: string | null
          detalle: NonNullable<Json>
          encargo_id: string
          estado: string
          huella: string | null
          id: string
          organizacion_id: string
          regla: string
          resolucion_motivo: string | null
          resuelta_en: string | null
          resuelta_por: string | null
          severidad: string
          vigente: boolean
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          detalle?: NonNullable<Json>
          encargo_id: string
          estado?: string
          huella?: string | null
          id?: string
          organizacion_id: string
          regla: string
          resolucion_motivo?: string | null
          resuelta_en?: string | null
          resuelta_por?: string | null
          severidad: string
          vigente?: boolean
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          detalle?: NonNullable<Json>
          encargo_id?: string
          estado?: string
          huella?: string | null
          id?: string
          organizacion_id?: string
          regla?: string
          resolucion_motivo?: string | null
          resuelta_en?: string | null
          resuelta_por?: string | null
          severidad?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "alerta_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      alias_entidad: {
        Row: {
          alias: string
          creado_en: string
          creado_por: string | null
          encargo_id: string
          entidad_id: string
          extraccion_id: string | null
          id: string
          organizacion_id: string
        }
        ComputedFields: never
        Insert: {
          alias: string
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          entidad_id: string
          extraccion_id?: string | null
          id?: string
          organizacion_id: string
        }
        Update: {
          alias?: string
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          entidad_id?: string
          extraccion_id?: string | null
          id?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alias_entidad_encargo_id_entidad_id_fkey"
            columns: ["encargo_id", "entidad_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "alias_entidad_encargo_id_extraccion_id_fkey"
            columns: ["encargo_id", "extraccion_id"]
            isOneToOne: false
            referencedRelation: "extraccion"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "alias_entidad_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      bitacora: {
        Row: {
          accion: string
          actor: string | null
          creado_en: string
          creado_por: string | null
          detalle: NonNullable<Json>
          en: string
          encargo_id: string | null
          id: string
          objeto_id: string | null
          objeto_tipo: string
          organizacion_id: string
        }
        ComputedFields: never
        Insert: {
          accion: string
          actor?: string | null
          creado_en?: string
          creado_por?: string | null
          detalle?: NonNullable<Json>
          en?: string
          encargo_id?: string | null
          id?: string
          objeto_id?: string | null
          objeto_tipo: string
          organizacion_id: string
        }
        Update: {
          accion?: string
          actor?: string | null
          creado_en?: string
          creado_por?: string | null
          detalle?: NonNullable<Json>
          en?: string
          encargo_id?: string | null
          id?: string
          objeto_id?: string | null
          objeto_tipo?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      calificacion: {
        Row: {
          ajustado_por: string | null
          ajuste_motivo: string | null
          ajuste_nivel: string | null
          creado_en: string
          creado_por: string | null
          criterios: NonNullable<Json>
          encargo_id: string
          id: string
          nivel: string
          objeto_id: string
          objeto_tipo: string
          organizacion_id: string
          puntaje: number
          red_id: string
        }
        ComputedFields: never
        Insert: {
          ajustado_por?: string | null
          ajuste_motivo?: string | null
          ajuste_nivel?: string | null
          creado_en?: string
          creado_por?: string | null
          criterios?: NonNullable<Json>
          encargo_id: string
          id?: string
          nivel: string
          objeto_id: string
          objeto_tipo: string
          organizacion_id: string
          puntaje: number
          red_id: string
        }
        Update: {
          ajustado_por?: string | null
          ajuste_motivo?: string | null
          ajuste_nivel?: string | null
          creado_en?: string
          creado_por?: string | null
          criterios?: NonNullable<Json>
          encargo_id?: string
          id?: string
          nivel?: string
          objeto_id?: string
          objeto_tipo?: string
          organizacion_id?: string
          puntaje?: number
          red_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calificacion_encargo_id_red_id_fkey"
            columns: ["encargo_id", "red_id"]
            isOneToOne: false
            referencedRelation: "red_generada"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "calificacion_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      carga_fuente: {
        Row: {
          creado_en: string
          creado_por: string | null
          estado: string
          filas: number
          filas_esperadas: number
          formato: string
          fuente_id: string
          id: string
          nombre_archivo: string
          organizacion_id: string
          sha256: string
          storage_path: string | null
          vigente_desde: string | null
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          estado?: string
          filas?: number
          filas_esperadas: number
          formato: string
          fuente_id: string
          id?: string
          nombre_archivo: string
          organizacion_id: string
          sha256: string
          storage_path?: string | null
          vigente_desde?: string | null
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          estado?: string
          filas?: number
          filas_esperadas?: number
          formato?: string
          fuente_id?: string
          id?: string
          nombre_archivo?: string
          organizacion_id?: string
          sha256?: string
          storage_path?: string | null
          vigente_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carga_fuente_organizacion_id_fuente_id_fkey"
            columns: ["organizacion_id", "fuente_id"]
            isOneToOne: false
            referencedRelation: "fuente_consulta"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      categoria_documental: {
        Row: {
          creado_en: string
          creado_por: string | null
          id: string
          nombre: string
          orden: number
          organizacion_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre: string
          orden?: number
          organizacion_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre?: string
          orden?: number
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categoria_documental_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_ia: {
        Row: {
          activa: boolean
          actualizado_en: string
          actualizado_por: string | null
          creado_en: string
          creado_por: string | null
          organizacion_id: string
          tope_diario_tokens: number
          tope_mensual_tokens: number
        }
        ComputedFields: never
        Insert: {
          activa?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          organizacion_id: string
          tope_diario_tokens?: number
          tope_mensual_tokens?: number
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          organizacion_id?: string
          tope_diario_tokens?: number
          tope_mensual_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_ia_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: true
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_origen: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          expediente_id: string | null
          folio: string | null
          fuente: string | null
          id: string
          mime: string | null
          nombre_archivo: string
          organizacion_id: string
          original_id: string | null
          recibido_en: string
          recibido_por: string | null
          sha256: string
          storage_path: string
          tamano: number | null
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          expediente_id?: string | null
          folio?: string | null
          fuente?: string | null
          id?: string
          mime?: string | null
          nombre_archivo: string
          organizacion_id: string
          original_id?: string | null
          recibido_en?: string
          recibido_por?: string | null
          sha256: string
          storage_path: string
          tamano?: number | null
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          expediente_id?: string | null
          folio?: string | null
          fuente?: string | null
          id?: string
          mime?: string | null
          nombre_archivo?: string
          organizacion_id?: string
          original_id?: string | null
          recibido_en?: string
          recibido_por?: string | null
          sha256?: string
          storage_path?: string
          tamano?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documento_origen_encargo_id_expediente_id_fkey"
            columns: ["encargo_id", "expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "documento_origen_encargo_id_original_id_fkey"
            columns: ["encargo_id", "original_id"]
            isOneToOne: false
            referencedRelation: "documento_origen"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "documento_origen_encargo_id_original_id_fkey"
            columns: ["encargo_id", "original_id"]
            isOneToOne: false
            referencedRelation: "importacion_resumen"
            referencedColumns: ["encargo_id", "documento_id"]
          },
          {
            foreignKeyName: "documento_origen_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      encargo: {
        Row: {
          creado_en: string
          creado_por: string | null
          estado: string
          ia_proveedores: string[]
          id: string
          nombre: string
          organizacion_id: string
          periodo_fin: string | null
          periodo_inicio: string | null
          tipo_auditoria: string | null
          umbral_confianza: number
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          estado?: string
          ia_proveedores?: string[]
          id?: string
          nombre: string
          organizacion_id: string
          periodo_fin?: string | null
          periodo_inicio?: string | null
          tipo_auditoria?: string | null
          umbral_confianza?: number
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          estado?: string
          ia_proveedores?: string[]
          id?: string
          nombre?: string
          organizacion_id?: string
          periodo_fin?: string | null
          periodo_inicio?: string | null
          tipo_auditoria?: string | null
          umbral_confianza?: number
        }
        Relationships: [
          {
            foreignKeyName: "encargo_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      entidad: {
        Row: {
          atributos: NonNullable<Json>
          creado_en: string
          creado_por: string | null
          encargo_id: string
          fusionada_en: string | null
          id: string
          identificadores: NonNullable<Json>
          nombre: string
          nombre_normalizado: string
          organizacion_id: string
          riesgo_declarado: string | null
          tipo: string
        }
        ComputedFields: never
        Insert: {
          atributos?: NonNullable<Json>
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          fusionada_en?: string | null
          id?: string
          identificadores?: NonNullable<Json>
          nombre: string
          nombre_normalizado: string
          organizacion_id: string
          riesgo_declarado?: string | null
          tipo: string
        }
        Update: {
          atributos?: NonNullable<Json>
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          fusionada_en?: string | null
          id?: string
          identificadores?: NonNullable<Json>
          nombre?: string
          nombre_normalizado?: string
          organizacion_id?: string
          riesgo_declarado?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "entidad_fusionada_en_fk"
            columns: ["encargo_id", "fusionada_en"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "entidad_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      evento: {
        Row: {
          atributos: NonNullable<Json>
          creado_en: string
          creado_por: string | null
          encargo_id: string
          fecha_hora: string | null
          id: string
          moneda: string | null
          monto: number | null
          organizacion_id: string
          tipo: string
        }
        ComputedFields: never
        Insert: {
          atributos?: NonNullable<Json>
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          fecha_hora?: string | null
          id?: string
          moneda?: string | null
          monto?: number | null
          organizacion_id: string
          tipo: string
        }
        Update: {
          atributos?: NonNullable<Json>
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          fecha_hora?: string | null
          id?: string
          moneda?: string | null
          monto?: number | null
          organizacion_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      evento_participante: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          entidad_id: string
          evento_id: string
          id: string
          organizacion_id: string
          rol: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          entidad_id: string
          evento_id: string
          id?: string
          organizacion_id: string
          rol: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          entidad_id?: string
          evento_id?: string
          id?: string
          organizacion_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_participante_encargo_id_entidad_id_fkey"
            columns: ["encargo_id", "entidad_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "evento_participante_encargo_id_evento_id_fkey"
            columns: ["encargo_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "evento"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "evento_participante_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      evidencia: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          extraccion_id: string | null
          id: string
          objeto_id: string
          objeto_tipo: string
          organizacion_id: string
          registro_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          extraccion_id?: string | null
          id?: string
          objeto_id: string
          objeto_tipo: string
          organizacion_id: string
          registro_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          extraccion_id?: string | null
          id?: string
          objeto_id?: string
          objeto_tipo?: string
          organizacion_id?: string
          registro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidencia_encargo_id_extraccion_id_fkey"
            columns: ["encargo_id", "extraccion_id"]
            isOneToOne: false
            referencedRelation: "extraccion"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "evidencia_encargo_id_registro_id_fkey"
            columns: ["encargo_id", "registro_id"]
            isOneToOne: false
            referencedRelation: "registro"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "evidencia_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      expediente: {
        Row: {
          creado_en: string
          creado_por: string | null
          descripcion: string | null
          encargo_id: string
          id: string
          identificador: string
          numero_control: string | null
          organizacion_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          encargo_id: string
          id?: string
          identificador: string
          numero_control?: string | null
          organizacion_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          encargo_id?: string
          id?: string
          identificador?: string
          numero_control?: string | null
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expediente_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      extraccion: {
        Row: {
          campo: string
          confianza: number | null
          creado_en: string
          creado_por: string | null
          encargo_id: string
          estado: string
          id: string
          metodo: string
          organizacion_id: string
          registro_id: string
          ubicacion: NonNullable<Json>
          validado_en: string | null
          validado_por: string | null
          valor_crudo: string | null
          valor_normalizado: Json | null
          valor_original: Json | null
        }
        ComputedFields: never
        Insert: {
          campo: string
          confianza?: number | null
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          estado?: string
          id?: string
          metodo: string
          organizacion_id: string
          registro_id: string
          ubicacion?: NonNullable<Json>
          validado_en?: string | null
          validado_por?: string | null
          valor_crudo?: string | null
          valor_normalizado?: Json | null
          valor_original?: Json | null
        }
        Update: {
          campo?: string
          confianza?: number | null
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          estado?: string
          id?: string
          metodo?: string
          organizacion_id?: string
          registro_id?: string
          ubicacion?: NonNullable<Json>
          validado_en?: string | null
          validado_por?: string | null
          valor_crudo?: string | null
          valor_normalizado?: Json | null
          valor_original?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "extraccion_encargo_id_registro_id_fkey"
            columns: ["encargo_id", "registro_id"]
            isOneToOne: false
            referencedRelation: "registro"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "extraccion_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      fuente_consulta: {
        Row: {
          activa: boolean
          conector: string
          config: NonNullable<Json>
          creado_en: string
          creado_por: string | null
          id: string
          nombre: string
          organizacion_id: string
          tipo: string
        }
        ComputedFields: never
        Insert: {
          activa?: boolean
          conector: string
          config?: NonNullable<Json>
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre: string
          organizacion_id: string
          tipo: string
        }
        Update: {
          activa?: boolean
          conector?: string
          config?: NonNullable<Json>
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre?: string
          organizacion_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuente_consulta_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      fusion_propuesta: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          entidad_a: string
          entidad_b: string
          estado: string
          id: string
          motivo: string
          organizacion_id: string
          resuelta_por: string | null
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          entidad_a: string
          entidad_b: string
          estado?: string
          id?: string
          motivo: string
          organizacion_id: string
          resuelta_por?: string | null
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          entidad_a?: string
          entidad_b?: string
          estado?: string
          id?: string
          motivo?: string
          organizacion_id?: string
          resuelta_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fusion_propuesta_encargo_id_entidad_a_fkey"
            columns: ["encargo_id", "entidad_a"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "fusion_propuesta_encargo_id_entidad_b_fkey"
            columns: ["encargo_id", "entidad_b"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "fusion_propuesta_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      hallazgo: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          firmado_en: string | null
          firmado_por: string | null
          id: string
          organizacion_id: string
          redaccion: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          firmado_en?: string | null
          firmado_por?: string | null
          id?: string
          organizacion_id: string
          redaccion: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          firmado_en?: string | null
          firmado_por?: string | null
          id?: string
          organizacion_id?: string
          redaccion?: string
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      hallazgo_alerta: {
        Row: {
          alerta_id: string
          creado_en: string
          creado_por: string | null
          encargo_id: string
          hallazgo_id: string
          id: string
          organizacion_id: string
        }
        ComputedFields: never
        Insert: {
          alerta_id: string
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          hallazgo_id: string
          id?: string
          organizacion_id: string
        }
        Update: {
          alerta_id?: string
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          hallazgo_id?: string
          id?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_alerta_encargo_id_alerta_id_fkey"
            columns: ["encargo_id", "alerta_id"]
            isOneToOne: false
            referencedRelation: "alerta"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "hallazgo_alerta_encargo_id_hallazgo_id_fkey"
            columns: ["encargo_id", "hallazgo_id"]
            isOneToOne: false
            referencedRelation: "hallazgo"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "hallazgo_alerta_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      hallazgo_sintesis: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          hallazgo_id: string
          id: string
          organizacion_id: string
          sintesis_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          hallazgo_id: string
          id?: string
          organizacion_id: string
          sintesis_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          hallazgo_id?: string
          id?: string
          organizacion_id?: string
          sintesis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_sintesis_encargo_id_hallazgo_id_fkey"
            columns: ["encargo_id", "hallazgo_id"]
            isOneToOne: false
            referencedRelation: "hallazgo"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "hallazgo_sintesis_encargo_id_sintesis_id_fkey"
            columns: ["encargo_id", "sintesis_id"]
            isOneToOne: false
            referencedRelation: "sintesis"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "hallazgo_sintesis_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      lista_69b: {
        Row: {
          carga_id: string
          creado_en: string
          creado_por: string | null
          datos: NonNullable<Json>
          id: string
          nombre: string
          nombre_normalizado: string
          organizacion_id: string
          rfc: string
          situacion: string
        }
        ComputedFields: never
        Insert: {
          carga_id: string
          creado_en?: string
          creado_por?: string | null
          datos?: NonNullable<Json>
          id?: string
          nombre: string
          nombre_normalizado: string
          organizacion_id: string
          rfc: string
          situacion: string
        }
        Update: {
          carga_id?: string
          creado_en?: string
          creado_por?: string | null
          datos?: NonNullable<Json>
          id?: string
          nombre?: string
          nombre_normalizado?: string
          organizacion_id?: string
          rfc?: string
          situacion?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_69b_organizacion_id_carga_id_fkey"
            columns: ["organizacion_id", "carga_id"]
            isOneToOne: false
            referencedRelation: "carga_fuente"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      miembro: {
        Row: {
          activo: boolean
          creado_en: string
          creado_por: string | null
          desactivado_en: string | null
          desactivado_por: string | null
          id: string
          organizacion_id: string
          rol: string
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          creado_en?: string
          creado_por?: string | null
          desactivado_en?: string | null
          desactivado_por?: string | null
          id?: string
          organizacion_id: string
          rol: string
          usuario_id: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          creado_por?: string | null
          desactivado_en?: string | null
          desactivado_por?: string | null
          id?: string
          organizacion_id?: string
          rol?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembro_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacion: {
        Row: {
          creado_en: string
          creado_por: string | null
          id: string
          nombre: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      plantilla_importacion: {
        Row: {
          creado_en: string
          creado_por: string | null
          firma_hojas: NonNullable<Json>
          id: string
          mapeo: NonNullable<Json>
          nombre: string
          organizacion_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          firma_hojas: NonNullable<Json>
          id?: string
          mapeo: NonNullable<Json>
          nombre: string
          organizacion_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          firma_hojas?: NonNullable<Json>
          id?: string
          mapeo?: NonNullable<Json>
          nombre?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantilla_importacion_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      precio_ia: {
        Row: {
          creado_en: string
          creado_por: string | null
          id: string
          modelo: string
          organizacion_id: string
          proveedor: string
          usd_millon_entrada: number
          usd_millon_salida: number
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          modelo: string
          organizacion_id: string
          proveedor: string
          usd_millon_entrada: number
          usd_millon_salida: number
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          modelo?: string
          organizacion_id?: string
          proveedor?: string
          usd_millon_entrada?: number
          usd_millon_salida?: number
        }
        Relationships: [
          {
            foreignKeyName: "precio_ia_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      red_generada: {
        Row: {
          alcance: number
          creado_en: string
          creado_por: string | null
          encargo_id: string
          generada_en: string
          generada_por: string | null
          id: string
          organizacion_id: string
          resumen: NonNullable<Json>
          semillas: string[]
          version_reglas: number
        }
        ComputedFields: never
        Insert: {
          alcance: number
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          generada_en?: string
          generada_por?: string | null
          id?: string
          organizacion_id: string
          resumen?: NonNullable<Json>
          semillas: string[]
          version_reglas: number
        }
        Update: {
          alcance?: number
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          generada_en?: string
          generada_por?: string | null
          id?: string
          organizacion_id?: string
          resumen?: NonNullable<Json>
          semillas?: string[]
          version_reglas?: number
        }
        Relationships: [
          {
            foreignKeyName: "red_generada_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      red_nodo: {
        Row: {
          creado_en: string
          creado_por: string | null
          distancia: number
          encargo_id: string
          entidad_id: string
          id: string
          organizacion_id: string
          red_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          distancia: number
          encargo_id: string
          entidad_id: string
          id?: string
          organizacion_id: string
          red_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          distancia?: number
          encargo_id?: string
          entidad_id?: string
          id?: string
          organizacion_id?: string
          red_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "red_nodo_encargo_id_entidad_id_fkey"
            columns: ["encargo_id", "entidad_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "red_nodo_encargo_id_red_id_fkey"
            columns: ["encargo_id", "red_id"]
            isOneToOne: false
            referencedRelation: "red_generada"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "red_nodo_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      red_vinculo: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          id: string
          organizacion_id: string
          red_id: string
          vinculo_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          id?: string
          organizacion_id: string
          red_id: string
          vinculo_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          id?: string
          organizacion_id?: string
          red_id?: string
          vinculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "red_vinculo_encargo_id_red_id_fkey"
            columns: ["encargo_id", "red_id"]
            isOneToOne: false
            referencedRelation: "red_generada"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "red_vinculo_encargo_id_vinculo_id_fkey"
            columns: ["encargo_id", "vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculo"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "red_vinculo_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      registro: {
        Row: {
          creado_en: string
          creado_por: string | null
          documento_id: string | null
          encargo_id: string
          estado_extraccion: string
          estado_validacion: string
          expediente_id: string | null
          extraccion_nota: string | null
          fecha_documento: string | null
          fuente: string | null
          id: string
          organizacion_id: string
          origen: string
          resumen: string | null
          tipo_documento_id: string | null
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          documento_id?: string | null
          encargo_id: string
          estado_extraccion?: string
          estado_validacion?: string
          expediente_id?: string | null
          extraccion_nota?: string | null
          fecha_documento?: string | null
          fuente?: string | null
          id?: string
          organizacion_id: string
          origen: string
          resumen?: string | null
          tipo_documento_id?: string | null
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          documento_id?: string | null
          encargo_id?: string
          estado_extraccion?: string
          estado_validacion?: string
          expediente_id?: string | null
          extraccion_nota?: string | null
          fecha_documento?: string | null
          fuente?: string | null
          id?: string
          organizacion_id?: string
          origen?: string
          resumen?: string | null
          tipo_documento_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registro_encargo_id_documento_id_fkey"
            columns: ["encargo_id", "documento_id"]
            isOneToOne: false
            referencedRelation: "documento_origen"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "registro_encargo_id_documento_id_fkey"
            columns: ["encargo_id", "documento_id"]
            isOneToOne: false
            referencedRelation: "importacion_resumen"
            referencedColumns: ["encargo_id", "documento_id"]
          },
          {
            foreignKeyName: "registro_encargo_id_expediente_id_fkey"
            columns: ["encargo_id", "expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "registro_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
          {
            foreignKeyName: "registro_organizacion_id_tipo_documento_id_fkey"
            columns: ["organizacion_id", "tipo_documento_id"]
            isOneToOne: false
            referencedRelation: "tipo_documento"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      registro_entidad: {
        Row: {
          creado_en: string
          creado_por: string | null
          encargo_id: string
          entidad_id: string
          id: string
          organizacion_id: string
          registro_id: string
          rol: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          entidad_id: string
          id?: string
          organizacion_id: string
          registro_id: string
          rol: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          entidad_id?: string
          id?: string
          organizacion_id?: string
          registro_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_entidad_encargo_id_entidad_id_fkey"
            columns: ["encargo_id", "entidad_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "registro_entidad_encargo_id_registro_id_fkey"
            columns: ["encargo_id", "registro_id"]
            isOneToOne: false
            referencedRelation: "registro"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "registro_entidad_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      regla_calificacion: {
        Row: {
          activa: boolean
          creado_en: string
          creado_por: string | null
          criterio: string
          id: string
          organizacion_id: string
          parametros: NonNullable<Json>
          peso: number
          version: number
        }
        ComputedFields: never
        Insert: {
          activa?: boolean
          creado_en?: string
          creado_por?: string | null
          criterio: string
          id?: string
          organizacion_id: string
          parametros?: NonNullable<Json>
          peso: number
          version: number
        }
        Update: {
          activa?: boolean
          creado_en?: string
          creado_por?: string | null
          criterio?: string
          id?: string
          organizacion_id?: string
          parametros?: NonNullable<Json>
          peso?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "regla_calificacion_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      resultado_consulta: {
        Row: {
          coincidencia: string
          consultado_en: string
          creado_en: string
          creado_por: string | null
          datos: NonNullable<Json>
          encargo_id: string
          entidad_id: string
          estado: string
          fuente_id: string
          huella: string
          id: string
          motivo: string | null
          organizacion_id: string
          registro_id: string | null
          revisado_en: string | null
          revisado_por: string | null
        }
        ComputedFields: never
        Insert: {
          coincidencia: string
          consultado_en?: string
          creado_en?: string
          creado_por?: string | null
          datos?: NonNullable<Json>
          encargo_id: string
          entidad_id: string
          estado?: string
          fuente_id: string
          huella: string
          id?: string
          motivo?: string | null
          organizacion_id: string
          registro_id?: string | null
          revisado_en?: string | null
          revisado_por?: string | null
        }
        Update: {
          coincidencia?: string
          consultado_en?: string
          creado_en?: string
          creado_por?: string | null
          datos?: NonNullable<Json>
          encargo_id?: string
          entidad_id?: string
          estado?: string
          fuente_id?: string
          huella?: string
          id?: string
          motivo?: string | null
          organizacion_id?: string
          registro_id?: string | null
          revisado_en?: string | null
          revisado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resultado_consulta_encargo_id_entidad_id_fkey"
            columns: ["encargo_id", "entidad_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "resultado_consulta_encargo_id_registro_id_fkey"
            columns: ["encargo_id", "registro_id"]
            isOneToOne: false
            referencedRelation: "registro"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "resultado_consulta_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
          {
            foreignKeyName: "resultado_consulta_organizacion_id_fuente_id_fkey"
            columns: ["organizacion_id", "fuente_id"]
            isOneToOne: false
            referencedRelation: "fuente_consulta"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      sintesis: {
        Row: {
          alcance_id: string
          alcance_tipo: string
          aprobada_en: string | null
          aprobada_por: string | null
          creado_en: string
          creado_por: string | null
          encargo_id: string
          estado: string
          generada_en: string | null
          id: string
          modelo: string | null
          motivo: string | null
          organizacion_id: string
          proveedor: string | null
          registros: string[]
        }
        ComputedFields: never
        Insert: {
          alcance_id: string
          alcance_tipo: string
          aprobada_en?: string | null
          aprobada_por?: string | null
          creado_en?: string
          creado_por?: string | null
          encargo_id: string
          estado?: string
          generada_en?: string | null
          id?: string
          modelo?: string | null
          motivo?: string | null
          organizacion_id: string
          proveedor?: string | null
          registros: string[]
        }
        Update: {
          alcance_id?: string
          alcance_tipo?: string
          aprobada_en?: string | null
          aprobada_por?: string | null
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string
          estado?: string
          generada_en?: string | null
          id?: string
          modelo?: string | null
          motivo?: string | null
          organizacion_id?: string
          proveedor?: string | null
          registros?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sintesis_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      tipo_documento: {
        Row: {
          campos_esperados: NonNullable<Json>
          categoria_id: string
          clave: string
          creado_en: string
          creado_por: string | null
          id: string
          nombre: string
          organizacion_id: string
        }
        ComputedFields: never
        Insert: {
          campos_esperados?: NonNullable<Json>
          categoria_id: string
          clave: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre: string
          organizacion_id: string
        }
        Update: {
          campos_esperados?: NonNullable<Json>
          categoria_id?: string
          clave?: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          nombre?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_documento_organizacion_id_categoria_id_fkey"
            columns: ["organizacion_id", "categoria_id"]
            isOneToOne: false
            referencedRelation: "categoria_documental"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
      tope_proveedor_ia: {
        Row: {
          actualizado_en: string
          creado_en: string
          creado_por: string | null
          organizacion_id: string
          proveedor: string
          tope_diario_tokens: number | null
          tope_mensual_tokens: number | null
        }
        ComputedFields: never
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          organizacion_id: string
          proveedor: string
          tope_diario_tokens?: number | null
          tope_mensual_tokens?: number | null
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          organizacion_id?: string
          proveedor?: string
          tope_diario_tokens?: number | null
          tope_mensual_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tope_proveedor_ia_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo: {
        Row: {
          bloqueado_hasta: string | null
          creado_en: string
          creado_por: string | null
          encargo_id: string | null
          error: string | null
          estado: string
          id: string
          intentos: number
          organizacion_id: string
          payload: NonNullable<Json>
          tipo: string
        }
        ComputedFields: never
        Insert: {
          bloqueado_hasta?: string | null
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string | null
          error?: string | null
          estado?: string
          id?: string
          intentos?: number
          organizacion_id: string
          payload?: NonNullable<Json>
          tipo: string
        }
        Update: {
          bloqueado_hasta?: string | null
          creado_en?: string
          creado_por?: string | null
          encargo_id?: string | null
          error?: string | null
          estado?: string
          id?: string
          intentos?: number
          organizacion_id?: string
          payload?: NonNullable<Json>
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
          {
            foreignKeyName: "trabajo_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_ia: {
        Row: {
          codigo_error: string | null
          creado_en: string
          duracion_ms: number | null
          encargo_id: string | null
          funcion: string
          id: string
          modelo: string
          organizacion_id: string
          proveedor: string
          registro_id: string | null
          resultado: string
          tokens_entrada: number
          tokens_salida: number
          trabajo_id: string | null
        }
        ComputedFields: never
        Insert: {
          codigo_error?: string | null
          creado_en?: string
          duracion_ms?: number | null
          encargo_id?: string | null
          funcion: string
          id?: string
          modelo: string
          organizacion_id: string
          proveedor: string
          registro_id?: string | null
          resultado: string
          tokens_entrada?: number
          tokens_salida?: number
          trabajo_id?: string | null
        }
        Update: {
          codigo_error?: string | null
          creado_en?: string
          duracion_ms?: number | null
          encargo_id?: string | null
          funcion?: string
          id?: string
          modelo?: string
          organizacion_id?: string
          proveedor?: string
          registro_id?: string | null
          resultado?: string
          tokens_entrada?: number
          tokens_salida?: number
          trabajo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uso_ia_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
          {
            foreignKeyName: "uso_ia_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculo: {
        Row: {
          creado_en: string
          creado_por: string | null
          destino_id: string
          dirigido: boolean
          encargo_id: string
          fecha_inicio: string | null
          fuerza: number | null
          fuerza_original: string | null
          id: string
          organizacion_id: string
          origen_id: string
          tipo: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          destino_id: string
          dirigido?: boolean
          encargo_id: string
          fecha_inicio?: string | null
          fuerza?: number | null
          fuerza_original?: string | null
          id?: string
          organizacion_id: string
          origen_id: string
          tipo: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          destino_id?: string
          dirigido?: boolean
          encargo_id?: string
          fecha_inicio?: string | null
          fuerza?: number | null
          fuerza_original?: string | null
          id?: string
          organizacion_id?: string
          origen_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculo_encargo_id_destino_id_fkey"
            columns: ["encargo_id", "destino_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "vinculo_encargo_id_origen_id_fkey"
            columns: ["encargo_id", "origen_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "vinculo_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
    }
    Views: {
      importacion_resumen: {
        Row: {
          cifras: number | null
          contratos: number | null
          documento_id: string | null
          encargo_id: string | null
          entidades: number | null
          expediente_id: string | null
          llamadas: number | null
          nombre_archivo: string | null
          organizacion_id: string | null
          recibido_en: string | null
          recibido_por: string | null
          registros: number | null
          sha256: string | null
          tamano: number | null
          transferencias: number | null
          vinculos: number | null
        }
        ComputedFields: never
        Insert: {
          cifras?: never
          contratos?: never
          documento_id?: string | null
          encargo_id?: string | null
          entidades?: never
          expediente_id?: string | null
          llamadas?: never
          nombre_archivo?: string | null
          organizacion_id?: string | null
          recibido_en?: string | null
          recibido_por?: string | null
          registros?: never
          sha256?: string | null
          tamano?: number | null
          transferencias?: never
          vinculos?: never
        }
        Update: {
          cifras?: never
          contratos?: never
          documento_id?: string | null
          encargo_id?: string | null
          entidades?: never
          expediente_id?: string | null
          llamadas?: never
          nombre_archivo?: string | null
          organizacion_id?: string | null
          recibido_en?: string | null
          recibido_por?: string | null
          registros?: never
          sha256?: string | null
          tamano?: number | null
          transferencias?: never
          vinculos?: never
        }
        Relationships: [
          {
            foreignKeyName: "documento_origen_encargo_id_expediente_id_fkey"
            columns: ["encargo_id", "expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["encargo_id", "id"]
          },
          {
            foreignKeyName: "documento_origen_organizacion_id_encargo_id_fkey"
            columns: ["organizacion_id", "encargo_id"]
            isOneToOne: false
            referencedRelation: "encargo"
            referencedColumns: ["organizacion_id", "id"]
          },
        ]
      }
    }
    Functions: {
      actualizar_estadisticas: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      agregar_lote_69b: {
        Args: { p_carga: string; p_filas: Json }
        Returns: number
      }
      asociar_documento: { Args: { p: Json }; Returns: Json }
      bitacora_registro: {
        Args: { p_registro: string }
        Returns: {
          accion: string
          actor_correo: string
          detalle: Json
          en: string
        }[]
      }
      bitacora_usuarios: {
        Args: {
          p_clase: string
          p_desde?: string
          p_hasta?: string
          p_limite?: number
          p_organizacion_id: string
          p_usuario_id?: string
        }
        Returns: {
          accion: string
          actor_correo: string
          detalle: Json
          en: string
          id: string
          usuario_correo: string
          usuario_id: string
        }[]
      }
      capturar_registro: { Args: { p: Json }; Returns: string }
      cerrar_carga_fuente: { Args: { p_carga: string }; Returns: number }
      crear_hallazgo: { Args: { p: Json }; Returns: string }
      crear_sintesis: { Args: { p: Json }; Returns: string }
      descartar_sintesis: {
        Args: { p_motivo: string; p_sintesis: string }
        Returns: undefined
      }
      encolar_consulta_fuentes: {
        Args: { p_encargo: string; p_entidad?: string }
        Returns: string
      }
      encolar_extraccion: { Args: { p_registro: string }; Returns: string }
      encolar_extracciones_en_espera: {
        Args: { p_encargo: string }
        Returns: number
      }
      es_miembro: {
        Args: { p_organizacion_id: string; p_roles?: string[] }
        Returns: boolean
      }
      expediente_arbol: {
        Args: { p: Json }
        Returns: {
          categoria: string
          categoria_id: string
          entidad: string
          entidad_id: string
          entidad_tipo: string
          expediente: string
          expediente_id: string
          nivel: number
          registros: number
        }[]
      }
      expediente_registros: {
        Args: { p: Json }
        Returns: {
          alertas: number
          archivo: string
          categoria: string
          categoria_id: string
          documento_id: string
          estado_extraccion: string
          estado_validacion: string
          expediente: string
          expediente_id: string
          fecha: string
          fila: number
          fuente: string
          hoja: string
          identificadores: Json
          involucrados: Json
          montos: Json
          nivel: string
          origen: string
          referencias: string[]
          registro_id: string
          resumen: string
          sha256: string
          tipo: string
          total: number
        }[]
      }
      guardar_alertas: { Args: { p: Json }; Returns: Json }
      guardar_borrador_sintesis: {
        Args: {
          p_afirmaciones: Json
          p_aprobar?: boolean
          p_registros?: string[]
          p_sintesis: string
        }
        Returns: undefined
      }
      guardar_configuracion_ia: {
        Args: {
          p_activa: boolean
          p_organizacion: string
          p_tope_diario: number
          p_tope_mensual: number
        }
        Returns: undefined
      }
      guardar_extraccion_ia: { Args: { p: Json }; Returns: Json }
      guardar_red: { Args: { p: Json }; Returns: string }
      guardar_resultados_consulta: { Args: { p: Json }; Returns: number }
      guardar_sintesis_ia: { Args: { p: Json }; Returns: undefined }
      guardar_tope_proveedor_ia: {
        Args: {
          p_organizacion: string
          p_proveedor: string
          p_tope_diario: number
          p_tope_mensual: number
        }
        Returns: undefined
      }
      ia_permitida: {
        Args: { p_encargo: string; p_proveedor: string }
        Returns: Json
      }
      importar_excel: { Args: { p: Json }; Returns: Json }
      incorporar_resultado_consulta: {
        Args: { p_resultado: string }
        Returns: string
      }
      iniciar_carga_fuente: { Args: { p: Json }; Returns: string }
      nueva_version_reglas: {
        Args: { p_organizacion: string; p_reglas: Json }
        Returns: number
      }
      rechazar_registro: {
        Args: { p_motivo: string; p_registro: string }
        Returns: undefined
      }
      registrar_acceso: {
        Args: { p_ip?: string; p_navegador?: string; p_tipo: string }
        Returns: undefined
      }
      registrar_acceso_fallido: {
        Args: { p_correo: string; p_ip?: string; p_navegador?: string }
        Returns: undefined
      }
      registrar_documento: { Args: { p: Json }; Returns: Json }
      registrar_uso_ia: { Args: { p: Json }; Returns: string }
      reintentar_sintesis: { Args: { p_sintesis: string }; Returns: undefined }
      resolver_alerta: {
        Args: { p_alerta: string; p_estado: string; p_motivo: string }
        Returns: undefined
      }
      resolver_fusion: {
        Args: { p_aceptar: boolean; p_fusion: string }
        Returns: undefined
      }
      resumen_uso_ia: { Args: { p_organizacion: string }; Returns: Json }
      terminar_trabajo: {
        Args: { p_error?: string; p_ok: boolean; p_trabajo: string }
        Returns: string
      }
      tomar_trabajos: {
        Args: { p_limite?: number; p_trabajo?: string }
        Returns: {
          bloqueado_hasta: string | null
          creado_en: string
          creado_por: string | null
          encargo_id: string | null
          error: string | null
          estado: string
          id: string
          intentos: number
          organizacion_id: string
          payload: NonNullable<Json>
          tipo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "trabajo"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      usuario_por_correo: {
        Args: { p_correo: string; p_organizacion_id: string }
        Returns: string
      }
      usuarios_organizacion: {
        Args: { p_organizacion_id: string }
        Returns: {
          activo: boolean
          correo: string
          creado_en: string
          desactivado_en: string
          miembro_id: string
          pendiente: boolean
          rol: string
          ultimo_acceso: string
          usuario_id: string
        }[]
      }
      validar_registro: { Args: { p: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
