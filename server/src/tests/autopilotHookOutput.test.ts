import test from 'node:test';import assert from 'node:assert/strict';import {provenOutput} from '../shared/autopilotHookOutput.js';import {hookCandidateContentIdentity} from '../shared/hookAppliedInput.js';
const fixture={
  "userId": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
  "run": {
    "id": "fff3d06f-2d26-4faa-bfd6-0f059a3a5edc",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
    "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
    "hook_session_id": "76bd05c3-bbdc-46eb-a957-7d4abd30de3f",
    "selected_hook_candidate_id": "8e8e2f6f-79df-44d6-a0ed-d5f1992ba896",
    "status": "APPROVED",
    "content_pack_id": "51d5dd69-c4e3-45f3-9173-4397eb7c98d8",
    "settings": {
      "target_platform": "tiktok"
    },
    "steps": [
      {
        "step": "HOOK_LAB",
        "status": "COMPLETED",
        "artifacts": {
          "hook_text": "MANUAL ORIGINAL"
        }
      },
      {
        "step": "APPROVAL",
        "status": "COMPLETED",
        "completed_at": "2026-11-23T19:20:42.379Z",
        "output_summary": "Approved by owner 6fc6543e-be0c-4327-ae03-b1455614ef9c at 2026-11-23T19:20:42.379Z. Ready for Publish Composer."
      }
    ],
    "approved_at": "2026-11-23T19:20:42.418Z",
    "approved_by": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "is_approved": true,
    "publishing_handoff": {
      "title": "Fixture handoff",
      "caption": "Fixture",
      "platform": "tiktok",
      "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
      "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
      "hook_text": "MANUAL ORIGINAL",
      "video_storage_path": "fixture-completed-hook.mp4",
      "video_render_status": "ready",
      "duration_seconds": 14,
      "aspect_ratio": "9:16",
      "thumbnail_url": null,
      "thumbnail_title": null,
      "thumbnail_aspect_ratio": null,
      "thumbnail_diagnostics": null,
      "autopilot_run_id": "fff3d06f-2d26-4faa-bfd6-0f059a3a5edc",
      "approved_at": "2026-11-23T19:20:42.418Z",
      "hook_output_receipt": {
        "version": 1,
        "output_artifact_receipt": {
          "version": 1,
          "key": "fixture-completed-hook.mp4",
          "size": 7,
          "etag": "\"fixture\"",
          "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "job_id": "455c8915-4594-4c3e-b52d-3a03080816ac",
          "render_version": 2,
          "editor_version": 3,
          "editor_project": {
            "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
            "version": 2,
            "digest": "810da3ea62c6fc089c4405fc6fc37c523ea05e2ae14e0155b32d93cd8bbc405a"
          }
        },
        "candidate_id": "8e8e2f6f-79df-44d6-a0ed-d5f1992ba896",
        "session_id": "76bd05c3-bbdc-46eb-a957-7d4abd30de3f",
        "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
        "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
        "source_key": "fixture/key",
        "selection_receipt_digest": "821a1c12a46af8453c2fffbd05a60eedd93143e37b990dae8f963f4b6cfa2c9e",
        "effective_source_start": 13,
        "effective_source_end": 21,
        "scoped_input_digest": "a231f61cfb08e77584a8e49811ea4ef6b586e6dc0d5eceec68b24840b16bb679",
        "editor": {
          "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
          "version": 2,
          "digest": "810da3ea62c6fc089c4405fc6fc37c523ea05e2ae14e0155b32d93cd8bbc405a"
        },
        "render_job_id": "455c8915-4594-4c3e-b52d-3a03080816ac",
        "render_version": 2,
        "editor_version": 3,
        "output_storage_path": "fixture-completed-hook.mp4",
        "hook_text": "MANUAL ORIGINAL",
        "semantic_truth_verified": false,
        "output_object": {
          "size": 7,
          "contentType": "",
          "etag": "\"fixture\"",
          "versionId": null
        }
      }
    },
    "updated_at": "2026-11-23T19:20:42.418Z"
  },
  "candidate": {
    "id": "8e8e2f6f-79df-44d6-a0ed-d5f1992ba896",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "hook_lab_session_id": "76bd05c3-bbdc-46eb-a957-7d4abd30de3f",
    "text": "MANUAL ORIGINAL",
    "locked": true,
    "manual_edit": true,
    "approved": true,
    "applied": true,
    "status": "APPLIED",
    "delivery_mode": "TEXT_OVERLAY",
    "source_evidence": [],
    "scores": {},
    "explanation": {
      "summary": "ORIGINAL"
    },
    "overall_hook_fit": 40,
    "text_overlay_plan": {
      "text": "MANUAL ORIGINAL",
      "start_time": 0.5,
      "end_time": 2.5,
      "position_y": 0.22,
      "font_size": 48,
      "font_family": "Inter",
      "color": "#ffffff"
    },
    "editor_apply_receipt": {
      "version": 1,
      "state": "applied",
      "editor_id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
      "before": {
        "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
        "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
        "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
        "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
        "version": 1,
        "status": "draft",
        "title": "Editor: Untitled Clip",
        "canvas": {
          "width": 1080,
          "height": 1920,
          "aspect_ratio": "9:16",
          "fps": 30,
          "duration": 8,
          "background_color": "#000000",
          "background_mode": "color"
        },
        "tracks": [
          {
            "id": "efc53a7f-ac0f-44ca-9637-e032e4f359dd",
            "type": "VIDEO",
            "name": "Main Video",
            "locked": false,
            "muted": false,
            "hidden": false,
            "height": 64,
            "items": [
              {
                "id": "23c43e82-0083-429d-b737-47194c8759a8",
                "track_id": "efc53a7f-ac0f-44ca-9637-e032e4f359dd",
                "type": "VIDEO",
                "source_asset_id": "500efea8-0aca-45cc-8ec5-88a266296594",
                "source_path": "fixture/key",
                "timeline_start": 0,
                "timeline_end": 8,
                "source_start": 13,
                "source_end": 21,
                "transform": {
                  "position_x": 0,
                  "position_y": 0,
                  "scale": 1,
                  "rotation": 0,
                  "opacity": 1
                },
                "crop": null,
                "layout_mode": "track",
                "crop_config": null,
                "speed": {
                  "speed": 1,
                  "pitch_preserved": true
                },
                "audio": {
                  "volume": 1,
                  "fade_in": 0.15,
                  "fade_out": 0.25,
                  "normalized": true,
                  "target_lufs": -16
                },
                "effects": [],
                "keyframes": [],
                "locked": false,
                "muted": false,
                "hidden": false,
                "z_index": 0
              }
            ]
          },
          {
            "id": "b51c8851-dab3-4cd1-969c-3ada88aaabcc",
            "type": "TEXT",
            "name": "Text & Titles",
            "locked": false,
            "muted": false,
            "hidden": false,
            "height": 48,
            "items": []
          },
          {
            "id": "bbb1a8ad-11ef-41ed-ae76-0716f962c9e4",
            "type": "CAPTION",
            "name": "Subtitles",
            "locked": false,
            "muted": false,
            "hidden": false,
            "height": 48,
            "items": [
              {
                "id": "28a6f4e5-838b-46da-95fb-f80587e283c7",
                "track_id": "bbb1a8ad-11ef-41ed-ae76-0716f962c9e4",
                "type": "CAPTION",
                "timeline_start": 0,
                "timeline_end": 8,
                "source_start": 0,
                "source_end": 8,
                "transform": {
                  "position_x": 0,
                  "position_y": 500,
                  "scale": 1,
                  "rotation": 0,
                  "opacity": 1
                },
                "speed": {
                  "speed": 1,
                  "pitch_preserved": true
                },
                "caption": {
                  "cues": [
                    {
                      "id": "cue-1",
                      "start": 2,
                      "end": 2.5,
                      "text": "NEVER",
                      "words": [
                        {
                          "text": "NEVER",
                          "start": 2,
                          "end": 2.5
                        }
                      ],
                      "tokens": [
                        {
                          "text": "NEVER",
                          "start": 2,
                          "end": 2.5
                        }
                      ]
                    },
                    {
                      "id": "cue-2",
                      "start": 6,
                      "end": 6.5,
                      "text": "MILLION",
                      "words": [
                        {
                          "text": "MILLION",
                          "start": 6,
                          "end": 6.5
                        }
                      ],
                      "tokens": [
                        {
                          "text": "MILLION",
                          "start": 6,
                          "end": 6.5
                        }
                      ]
                    }
                  ],
                  "cues_covered_end": 8,
                  "style": "vireo_comic_default",
                  "position": "bottom",
                  "primary_color": "#FFFFFF",
                  "highlight_color": "#20FF35",
                  "animation": "none"
                },
                "effects": [],
                "keyframes": [],
                "locked": false,
                "muted": true,
                "hidden": false,
                "z_index": 20
              }
            ]
          },
          {
            "id": "22946c9e-a867-4aa0-b0d5-8a0c1a7ca2f9",
            "type": "AUDIO",
            "name": "Sound Design (SFX)",
            "locked": false,
            "muted": false,
            "hidden": false,
            "height": 48,
            "items": [
              {
                "id": "ecbfa847-400c-4a16-a75a-9c14bf698020",
                "track_id": "22946c9e-a867-4aa0-b0d5-8a0c1a7ca2f9",
                "type": "AUDIO",
                "source_asset_id": "sfx_pop",
                "source_path": "builtin://sfx/pop.wav",
                "timeline_start": 2,
                "timeline_end": 2.2,
                "source_start": 0,
                "source_end": 0.2,
                "transform": {
                  "position_x": 0,
                  "position_y": 0,
                  "scale": 1,
                  "rotation": 0,
                  "opacity": 1
                },
                "speed": {
                  "speed": 1,
                  "pitch_preserved": true
                },
                "audio": {
                  "volume": 0.3,
                  "fade_in": 0.05,
                  "fade_out": 0.05,
                  "normalized": true,
                  "target_lufs": -20
                },
                "effects": [],
                "keyframes": [],
                "locked": false,
                "muted": false,
                "hidden": false,
                "z_index": 5
              },
              {
                "id": "180d0f63-fa00-4922-89ff-1ab69a3a4709",
                "track_id": "22946c9e-a867-4aa0-b0d5-8a0c1a7ca2f9",
                "type": "AUDIO",
                "source_asset_id": "sfx_pop",
                "source_path": "builtin://sfx/pop.wav",
                "timeline_start": 6,
                "timeline_end": 6.2,
                "source_start": 0,
                "source_end": 0.2,
                "transform": {
                  "position_x": 0,
                  "position_y": 0,
                  "scale": 1,
                  "rotation": 0,
                  "opacity": 1
                },
                "speed": {
                  "speed": 1,
                  "pitch_preserved": true
                },
                "audio": {
                  "volume": 0.3,
                  "fade_in": 0.05,
                  "fade_out": 0.05,
                  "normalized": true,
                  "target_lufs": -20
                },
                "effects": [],
                "keyframes": [],
                "locked": false,
                "muted": false,
                "hidden": false,
                "z_index": 5
              }
            ]
          }
        ],
        "playhead": 0,
        "settings": {
          "snapping": true,
          "safe_guides": true,
          "snap_tolerance_sec": 0.15,
          "show_safe_zones": true
        },
        "producer_plan_id": null,
        "output_storage_path": null,
        "preview_video_url": null,
        "created_at": "2026-11-23T19:20:42.177Z",
        "updated_at": "2026-11-23T19:20:42.177Z",
        "source_duration_seconds": 30
      },
      "after": {
        "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
        "version": 2,
        "digest": "810da3ea62c6fc089c4405fc6fc37c523ea05e2ae14e0155b32d93cd8bbc405a"
      },
      "after_title": "Editor: Untitled Clip",
      "candidate_content_identity": "95de8b58936682de0a381496a37fda7d17f4762845da37456a6c383a83159c9f",
      "applied_input_receipt": {
        "version": 1,
        "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
        "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
        "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
        "source_key": "fixture/key",
        "selection_receipt_digest": "821a1c12a46af8453c2fffbd05a60eedd93143e37b990dae8f963f4b6cfa2c9e",
        "effective_source_start": 13,
        "effective_source_end": 21,
        "scoped_input_digest": "a231f61cfb08e77584a8e49811ea4ef6b586e6dc0d5eceec68b24840b16bb679",
        "semantic_truth_verified": false
      }
    },
    "updated_at": "2026-11-23T19:20:42.335Z",
    "autopilot_approval_fence": 1
  },
  "session": {
    "id": "76bd05c3-bbdc-46eb-a957-7d4abd30de3f",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
    "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
    "content_pack_id": null,
    "brand_brain_id": "c32a7bed-e307-4cb4-a6ef-b4246dab43a8",
    "brand_brain_version": 1,
    "source_language": "en",
    "status": "APPLIED",
    "version": 1,
    "opening_window": {
      "start_seconds": 0,
      "end_seconds": 3
    },
    "analysis": {
      "current_hook_text": "never",
      "current_hook_source": "TRANSCRIPT",
      "current_hook_type": "CONTRARIAN",
      "current_hook_score": 25,
      "time_to_first_meaningful_speech_sec": 2,
      "latency_label": "MODERATE",
      "has_leading_silence": true,
      "leading_silence_duration_sec": 2,
      "has_leading_filler": false,
      "leading_filler_words": [],
      "multimodal_signals": {
        "speech_energy_db": -18.5,
        "visual_activity_score": 45,
        "scene_cuts_in_window": 0,
        "face_present": false,
        "ocr_text_present": false,
        "audio_energy_score": 75
      },
      "issues": [
        "SLOW_START",
        "CONTEXT_DELAY",
        "WEAK_SPECIFICITY"
      ],
      "strengths": [
        "HIGH_SPEECH_ENERGY"
      ]
    },
    "created_at": "2026-11-23T19:20:42.245Z",
    "updated_at": "2026-11-23T19:20:42.335Z",
    "generation_input_receipt": {
      "version": 1,
      "clock": "effective-clip-relative",
      "source_key": "fixture/key",
      "source_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "transcript_content_sha256": "95ea010ff153afc90e44b277b30a7e3c7a0867b666eeba3d482f8a1e407952c0",
      "effective_source_start": 13,
      "effective_source_end": 21,
      "scoped_input_digest": "a231f61cfb08e77584a8e49811ea4ef6b586e6dc0d5eceec68b24840b16bb679",
      "method": "opening-analysis-input",
      "semantic_truth_verified": false
    },
    "autopilot_approval_fence": 1
  },
  "clip": {
    "id": "500efea8-0aca-45cc-8ec5-88a266296594",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
    "start_seconds": 10,
    "end_seconds": 24,
    "duration_seconds": 14,
    "trim_start_offset": 3,
    "trim_end_offset": 3,
    "aspect_ratio": "9:16",
    "crop_mode": "center",
    "render_status": "ready",
    "render_version": 2,
    "editor_version": 3,
    "source_storage_path": "fixture/key",
    "selection_source_receipt": {
      "version": 1,
      "source_key": "fixture/key",
      "source_receipt": {
        "key": "fixture/key",
        "size": 7,
        "etag": "\"fixture\"",
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "transcript_content_sha256": "95ea010ff153afc90e44b277b30a7e3c7a0867b666eeba3d482f8a1e407952c0"
    },
    "caption_enabled": true,
    "caption_style": "vireo_comic_default",
    "hook_generation_fence": 1,
    "editor_project_sync_pending": null,
    "render_error_code": null,
    "render_error_message": null,
    "rendered_editor_saved_at": "2026-11-23T19:20:42.323Z",
    "rendered_editor_version": 2,
    "updated_at": "2026-11-23T19:20:42.356Z",
    "output_artifact_receipt": {
      "version": 1,
      "key": "fixture-completed-hook.mp4",
      "size": 7,
      "etag": "\"fixture\"",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "job_id": "455c8915-4594-4c3e-b52d-3a03080816ac",
      "render_version": 2,
      "editor_version": 3,
      "editor_project": {
        "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
        "version": 2,
        "digest": "810da3ea62c6fc089c4405fc6fc37c523ea05e2ae14e0155b32d93cd8bbc405a"
      }
    },
    "output_object_key": "fixture-completed-hook.mp4",
    "output_storage_path": "fixture-completed-hook.mp4",
    "rendered_editor_digest": "810da3ea62c6fc089c4405fc6fc37c523ea05e2ae14e0155b32d93cd8bbc405a",
    "autopilot_approval_fence": 1
  },
  "editor": {
    "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
    "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
    "version": 2,
    "status": "draft",
    "title": "Editor: Untitled Clip",
    "canvas": {
      "width": 1080,
      "height": 1920,
      "aspect_ratio": "9:16",
      "fps": 30,
      "duration": 8,
      "background_color": "#000000",
      "background_mode": "color"
    },
    "tracks": [
      {
        "id": "efc53a7f-ac0f-44ca-9637-e032e4f359dd",
        "type": "VIDEO",
        "name": "Main Video",
        "locked": false,
        "muted": false,
        "hidden": false,
        "height": 64,
        "items": [
          {
            "id": "23c43e82-0083-429d-b737-47194c8759a8",
            "track_id": "efc53a7f-ac0f-44ca-9637-e032e4f359dd",
            "type": "VIDEO",
            "source_asset_id": "500efea8-0aca-45cc-8ec5-88a266296594",
            "source_path": "fixture/key",
            "timeline_start": 0,
            "timeline_end": 8,
            "source_start": 13,
            "source_end": 21,
            "transform": {
              "position_x": 0,
              "position_y": 0,
              "scale": 1,
              "rotation": 0,
              "opacity": 1
            },
            "crop": null,
            "layout_mode": "track",
            "crop_config": null,
            "speed": {
              "speed": 1,
              "pitch_preserved": true
            },
            "audio": {
              "volume": 1,
              "fade_in": 0.15,
              "fade_out": 0.25,
              "normalized": true,
              "target_lufs": -16
            },
            "effects": [],
            "keyframes": [],
            "locked": false,
            "muted": false,
            "hidden": false,
            "z_index": 0
          }
        ]
      },
      {
        "id": "b51c8851-dab3-4cd1-969c-3ada88aaabcc",
        "type": "TEXT",
        "name": "Text & Titles",
        "locked": false,
        "muted": false,
        "hidden": false,
        "height": 48,
        "items": []
      },
      {
        "id": "bbb1a8ad-11ef-41ed-ae76-0716f962c9e4",
        "type": "CAPTION",
        "name": "Subtitles",
        "locked": false,
        "muted": false,
        "hidden": false,
        "height": 48,
        "items": [
          {
            "id": "28a6f4e5-838b-46da-95fb-f80587e283c7",
            "track_id": "bbb1a8ad-11ef-41ed-ae76-0716f962c9e4",
            "type": "CAPTION",
            "timeline_start": 0,
            "timeline_end": 8,
            "source_start": 0,
            "source_end": 8,
            "transform": {
              "position_x": 0,
              "position_y": 500,
              "scale": 1,
              "rotation": 0,
              "opacity": 1
            },
            "speed": {
              "speed": 1,
              "pitch_preserved": true
            },
            "caption": {
              "cues": [
                {
                  "id": "cue-1",
                  "start": 2,
                  "end": 2.5,
                  "text": "NEVER",
                  "words": [
                    {
                      "text": "NEVER",
                      "start": 2,
                      "end": 2.5
                    }
                  ],
                  "tokens": [
                    {
                      "text": "NEVER",
                      "start": 2,
                      "end": 2.5
                    }
                  ]
                },
                {
                  "id": "cue-2",
                  "start": 6,
                  "end": 6.5,
                  "text": "MILLION",
                  "words": [
                    {
                      "text": "MILLION",
                      "start": 6,
                      "end": 6.5
                    }
                  ],
                  "tokens": [
                    {
                      "text": "MILLION",
                      "start": 6,
                      "end": 6.5
                    }
                  ]
                }
              ],
              "cues_covered_end": 8,
              "style": "vireo_comic_default",
              "position": "bottom",
              "primary_color": "#FFFFFF",
              "highlight_color": "#20FF35",
              "animation": "none"
            },
            "effects": [],
            "keyframes": [],
            "locked": false,
            "muted": true,
            "hidden": false,
            "z_index": 20
          }
        ]
      },
      {
        "id": "22946c9e-a867-4aa0-b0d5-8a0c1a7ca2f9",
        "type": "AUDIO",
        "name": "Sound Design (SFX)",
        "locked": false,
        "muted": false,
        "hidden": false,
        "height": 48,
        "items": [
          {
            "id": "ecbfa847-400c-4a16-a75a-9c14bf698020",
            "track_id": "22946c9e-a867-4aa0-b0d5-8a0c1a7ca2f9",
            "type": "AUDIO",
            "source_asset_id": "sfx_pop",
            "source_path": "builtin://sfx/pop.wav",
            "timeline_start": 2,
            "timeline_end": 2.2,
            "source_start": 0,
            "source_end": 0.2,
            "transform": {
              "position_x": 0,
              "position_y": 0,
              "scale": 1,
              "rotation": 0,
              "opacity": 1
            },
            "speed": {
              "speed": 1,
              "pitch_preserved": true
            },
            "audio": {
              "volume": 0.3,
              "fade_in": 0.05,
              "fade_out": 0.05,
              "normalized": true,
              "target_lufs": -20
            },
            "effects": [],
            "keyframes": [],
            "locked": false,
            "muted": false,
            "hidden": false,
            "z_index": 5
          },
          {
            "id": "180d0f63-fa00-4922-89ff-1ab69a3a4709",
            "track_id": "22946c9e-a867-4aa0-b0d5-8a0c1a7ca2f9",
            "type": "AUDIO",
            "source_asset_id": "sfx_pop",
            "source_path": "builtin://sfx/pop.wav",
            "timeline_start": 6,
            "timeline_end": 6.2,
            "source_start": 0,
            "source_end": 0.2,
            "transform": {
              "position_x": 0,
              "position_y": 0,
              "scale": 1,
              "rotation": 0,
              "opacity": 1
            },
            "speed": {
              "speed": 1,
              "pitch_preserved": true
            },
            "audio": {
              "volume": 0.3,
              "fade_in": 0.05,
              "fade_out": 0.05,
              "normalized": true,
              "target_lufs": -20
            },
            "effects": [],
            "keyframes": [],
            "locked": false,
            "muted": false,
            "hidden": false,
            "z_index": 5
          }
        ]
      },
      {
        "id": "1a1918c1-73f6-49df-9c75-25004fb74d58",
        "type": "TEXT",
        "name": "Hook Lab Text",
        "items": [
          {
            "id": "5520d43c-e62f-4a3e-97dc-06c9ce73e75d",
            "track_id": "1a1918c1-73f6-49df-9c75-25004fb74d58",
            "type": "TEXT",
            "timeline_start": 0.5,
            "timeline_end": 2.5,
            "source_start": 0,
            "source_end": 2,
            "speed": {
              "speed": 1,
              "pitch_preserved": true
            },
            "transform": {
              "position_x": 0,
              "position_y": -179.20000000000002,
              "scale": 1,
              "rotation": 0,
              "opacity": 1
            },
            "text": {
              "text": "MANUAL ORIGINAL",
              "font_family": "Inter",
              "font_size": 16,
              "font_weight": "bold",
              "italic": false,
              "alignment": "center",
              "color": "#ffffff",
              "background_color": "#000000",
              "background_padding": 8,
              "animation": "none",
              "auto_headline": true
            },
            "keyframes": [],
            "effects": [],
            "locked": false,
            "hidden": false,
            "muted": true,
            "z_index": 10
          }
        ],
        "locked": false,
        "hidden": false,
        "muted": false
      }
    ],
    "playhead": 0,
    "settings": {
      "snapping": true,
      "safe_guides": true,
      "snap_tolerance_sec": 0.15,
      "show_safe_zones": true
    },
    "producer_plan_id": null,
    "output_storage_path": null,
    "preview_video_url": null,
    "created_at": "2026-11-23T19:20:42.177Z",
    "updated_at": "2026-11-23T19:20:42.323Z",
    "render_admission_serial": 1,
    "render_fence_serial": 1,
    "autopilot_approval_fence": 1
  },
  "project": {
    "id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "source_url": "fixture/key",
    "duration_seconds": 30,
    "hook_generation_fence": 1,
    "hook_apply_fence": 1,
    "autopilot_approval_fence": 1
  },
  "transcript": {
    "id": "89e811ea-621a-43ed-8df5-b3dba096ea71",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
    "duration_seconds": 30,
    "transcript_text": "money never million profit",
    "words": [
      {
        "word": "money",
        "start": 11,
        "end": 11.5
      },
      {
        "word": "never",
        "start": 15,
        "end": 15.5
      },
      {
        "word": "million",
        "start": 19,
        "end": 19.5
      },
      {
        "word": "profit",
        "start": 22,
        "end": 22.5
      }
    ],
    "segments": [
      {
        "start": 11,
        "end": 11.5,
        "text": "money"
      },
      {
        "start": 15,
        "end": 15.5,
        "text": "never"
      },
      {
        "start": 19,
        "end": 19.5,
        "text": "million"
      },
      {
        "start": 22,
        "end": 22.5,
        "text": "profit"
      }
    ],
    "source_binding": {
      "version": 1,
      "source_receipt": {
        "key": "fixture/key",
        "size": 7,
        "etag": "\"fixture\"",
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "prepared_audio_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "requests": [
        {
          "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "bytes": 7,
          "status": "completed"
        }
      ],
      "transcript_content_sha256": "95ea010ff153afc90e44b277b30a7e3c7a0867b666eeba3d482f8a1e407952c0"
    },
    "hook_generation_fence": 1,
    "hook_apply_fence": 1,
    "autopilot_approval_fence": 1
  },
  "job": {
    "id": "455c8915-4594-4c3e-b52d-3a03080816ac",
    "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "status": "completed",
    "stage": "queued",
    "progress": 0,
    "attempts": 0,
    "max_attempts": 3,
    "worker_id": null,
    "locked_at": null,
    "next_retry_at": null,
    "render_version": 2,
    "editor_version": 3,
    "admission_version": 1,
    "editor_project_snapshot": {
      "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
      "version": 2,
      "digest": "810da3ea62c6fc089c4405fc6fc37c523ea05e2ae14e0155b32d93cd8bbc405a"
    },
    "created_at": "2026-11-23T19:20:42.356Z",
    "updated_at": "2026-11-23T19:20:42.356Z",
    "output_artifact_receipt": {
      "version": 1,
      "key": "fixture-completed-hook.mp4",
      "size": 7,
      "etag": "\"fixture\"",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "job_id": "455c8915-4594-4c3e-b52d-3a03080816ac",
      "render_version": 2,
      "editor_version": 3,
      "editor_project": {
        "id": "8df5a994-ab82-4779-8e93-0b3287514bbc",
        "version": 2,
        "digest": "810da3ea62c6fc089c4405fc6fc37c523ea05e2ae14e0155b32d93cd8bbc405a"
      }
    },
    "autopilot_approval_fence": 1
  },
  "active": null,
  "pack": {
    "id": "51d5dd69-c4e3-45f3-9173-4397eb7c98d8",
    "user_id": "6fc6543e-be0c-4327-ae03-b1455614ef9c",
    "clip_id": "500efea8-0aca-45cc-8ec5-88a266296594",
    "project_id": "27bd4b2c-6aea-42e1-839e-292e2887689b",
    "autopilot_approval_fence": 1
  },
  "items": [],
  "thumbSession": null,
  "thumb": null
};
const make=():any=>structuredClone(fixture);
test('new explicit overlay has bound source, candidate, editor, job and output proof',()=>{const i=make(),p=provenOutput(i);assert.equal(p.hook_text,i.candidate.text);assert.equal(p.render_job_id,i.job.id);assert.equal(p.output_artifact_receipt.sha256,i.clip.output_artifact_receipt.sha256);assert.equal(p.semantic_truth_verified,false);});
test('refuse later candidate words',()=>{const i=make();i.candidate.text='LATER';assert.throws(()=>provenOutput(i));});
test('refuse later overlay plan',()=>{const i=make();i.candidate.text_overlay_plan.end_time=3;assert.throws(()=>provenOutput(i));});
test('refuse legacy receipt',()=>{const i=make();delete i.candidate.editor_apply_receipt.candidate_content_identity;assert.throws(()=>provenOutput(i));});
test('refuse changed source trim',()=>{const i=make();i.clip.trim_start_offset++;assert.throws(()=>provenOutput(i));});
test('refuse changed source object',()=>{const i=make();i.project.source_url='other';assert.throws(()=>provenOutput(i));});
test('refuse changed transcript',()=>{const i=make();i.transcript.transcript_text='OTHER';assert.throws(()=>provenOutput(i));});
test('refuse foreign candidate',()=>{const i=make();i.candidate.user_id='other';assert.throws(()=>provenOutput(i));});
test('refuse different clip',()=>{const i=make();i.run.clip_id='other';assert.throws(()=>provenOutput(i));});
test('refuse different session',()=>{const i=make();i.run.hook_session_id='other';assert.throws(()=>provenOutput(i));});
test('refuse active job',()=>{const i=make();i.active={id:'active'};assert.throws(()=>provenOutput(i));});
test('refuse live run lock',()=>{const i=make();i.run.execution_lock='new';assert.throws(()=>provenOutput(i));});
test('refuse new editor revision',()=>{const i=make();i.editor.version++;assert.throws(()=>provenOutput(i));});
test('refuse failed job',()=>{const i=make();i.job.status='failed';assert.throws(()=>provenOutput(i));});
test('refuse old render version',()=>{const i=make();i.clip.render_version++;assert.throws(()=>provenOutput(i));});
test('refuse changed editor digest',()=>{const i=make();i.clip.rendered_editor_digest='bad';assert.throws(()=>provenOutput(i));});
test('refuse legacy artifact',()=>{const i=make();delete i.clip.output_artifact_receipt;assert.throws(()=>provenOutput(i));});
test('refuse bad artifact hash',()=>{const i=make();i.clip.output_artifact_receipt.sha256='bad';assert.throws(()=>provenOutput(i));});
test('refuse artifact job mismatch',()=>{const i=make();i.job.output_artifact_receipt.etag='other';assert.throws(()=>provenOutput(i));});
test('refuse artifact path mismatch',()=>{const i=make();i.clip.output_storage_path='other';assert.throws(()=>provenOutput(i));});
test('refuse unsupported mode',()=>{const i=make();i.candidate.delivery_mode='SPOKEN_REWRITE';assert.throws(()=>provenOutput(i));});
test('refuse not applied',()=>{const i=make();i.candidate.applied=false;assert.throws(()=>provenOutput(i));});
test('refuse reverted',()=>{const i=make();i.candidate.editor_apply_receipt.state='reverted';assert.throws(()=>provenOutput(i));});
test('refuse pending clip sync',()=>{const i=make();i.clip.editor_project_sync_pending={id:'pending'};assert.throws(()=>provenOutput(i));});
test('content identity excludes status and locking metadata but preserves actual current words and plans',()=>{const i=make(),a=hookCandidateContentIdentity(i.candidate);i.candidate.locked=!i.candidate.locked;i.candidate.approved=!i.candidate.approved;assert.equal(a,hookCandidateContentIdentity(i.candidate));i.candidate.text+=' X';assert.notEqual(a,hookCandidateContentIdentity(i.candidate));});
