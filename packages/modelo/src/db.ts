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
      miembro: {
        Row: {
          creado_en: string
          creado_por: string | null
          id: string
          organizacion_id: string
          rol: string
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          id?: string
          organizacion_id: string
          rol: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
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
          estado_validacion: string
          expediente_id: string | null
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
          estado_validacion?: string
          expediente_id?: string | null
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
          estado_validacion?: string
          expediente_id?: string | null
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
          id: string
          organizacion_id: string
          registro_id: string | null
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
          id?: string
          organizacion_id: string
          registro_id?: string | null
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
          id?: string
          organizacion_id?: string
          registro_id?: string | null
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
      es_miembro: {
        Args: { p_organizacion_id: string; p_roles?: string[] }
        Returns: boolean
      }
      guardar_alertas: { Args: { p: Json }; Returns: Json }
      guardar_red: { Args: { p: Json }; Returns: string }
      importar_excel: { Args: { p: Json }; Returns: Json }
      nueva_version_reglas: {
        Args: { p_organizacion: string; p_reglas: Json }
        Returns: number
      }
      resolver_alerta: {
        Args: { p_alerta: string; p_estado: string; p_motivo: string }
        Returns: undefined
      }
      resolver_fusion: {
        Args: { p_aceptar: boolean; p_fusion: string }
        Returns: undefined
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
