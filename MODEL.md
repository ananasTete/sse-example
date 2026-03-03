1. 创建会话
2. 获取历史记录（待定，不知道历史记录名字是怎么获得的）
3. 发起请求，携带用户消息、parentId

会话详情

```json
{
  "title": "测试重新生成",
  "create_time": 1772529091.869274,
  "update_time": 1772529350.863125,
  "mapping": {
    "client-created-root": {
      "id": "client-created-root",
      "message": null,
      "parent": null,
      "children": ["28c21df9-6c3b-42bb-90ad-100cb26d47ec"]
    },
    "28c21df9-6c3b-42bb-90ad-100cb26d47ec": {
      "id": "28c21df9-6c3b-42bb-90ad-100cb26d47ec",
      "message": {
        "id": "28c21df9-6c3b-42bb-90ad-100cb26d47ec",
        "author": {
          "role": "system",
          "name": null,
          "metadata": {}
        },
        "create_time": null,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": [""]
        },
        "status": "finished_successfully",
        "end_turn": true,
        "weight": 0.0,
        "metadata": {
          "is_visually_hidden_from_conversation": true,
          "can_save": false
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "client-created-root",
      "children": ["71583cf5-5313-4f31-9487-909cf4260e7b"]
    },
    "71583cf5-5313-4f31-9487-909cf4260e7b": {
      "id": "71583cf5-5313-4f31-9487-909cf4260e7b",
      "message": {
        "id": "71583cf5-5313-4f31-9487-909cf4260e7b",
        "author": {
          "role": "system",
          "name": null,
          "metadata": {}
        },
        "create_time": null,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": [""]
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "is_contextual_answers_system_message": true,
          "contextual_answers_message_type": "identity_prompt",
          "is_visually_hidden_from_conversation": true,
          "can_save": false
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "28c21df9-6c3b-42bb-90ad-100cb26d47ec",
      "children": ["5a042604-daaf-44aa-ad64-784d25c02ca5"]
    },
    "5a042604-daaf-44aa-ad64-784d25c02ca5": {
      "id": "5a042604-daaf-44aa-ad64-784d25c02ca5",
      "message": {
        "id": "5a042604-daaf-44aa-ad64-784d25c02ca5",
        "author": {
          "role": "user",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529091.306,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": ["测试重新生成"]
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "developer_mode_connector_ids": [],
          "selected_sources": [],
          "selected_github_repos": [],
          "serialization_metadata": {
            "custom_symbol_offsets": []
          },
          "request_id": "6e26ad28-6224-4cd5-a464-b1ac44af1a7c",
          "message_source": null,
          "turn_exchange_id": "1082db3e-16f9-4a30-8409-3928a3617fb5",
          "resolved_model_slug": "gpt-5-2",
          "can_save": false
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "71583cf5-5313-4f31-9487-909cf4260e7b",
      "children": [
        "2cc2cb60-9b84-44f3-b325-c4e90873ef48",
        "3cf9ea42-cb71-4506-a68b-7775fde2f4aa"
      ]
    },
    "2cc2cb60-9b84-44f3-b325-c4e90873ef48": {
      "id": "2cc2cb60-9b84-44f3-b325-c4e90873ef48",
      "message": {
        "id": "2cc2cb60-9b84-44f3-b325-c4e90873ef48",
        "author": {
          "role": "system",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529091.7427993,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": [""]
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "is_contextual_answers_system_message": true,
          "is_visually_hidden_from_conversation": true,
          "command": "prompt",
          "contextual_answers_message_type": "sources_and_filters_prompt",
          "request_id": "6e26ad28-6224-4cd5-a464-b1ac44af1a7c",
          "message_type": "next",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "parent_id": "5a042604-daaf-44aa-ad64-784d25c02ca5",
          "turn_exchange_id": "1082db3e-16f9-4a30-8409-3928a3617fb5",
          "can_save": false
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "5a042604-daaf-44aa-ad64-784d25c02ca5",
      "children": ["c7ec4ae2-b777-487b-885a-c71f98928ef7"]
    },
    "3cf9ea42-cb71-4506-a68b-7775fde2f4aa": {
      "id": "3cf9ea42-cb71-4506-a68b-7775fde2f4aa",
      "message": {
        "id": "3cf9ea42-cb71-4506-a68b-7775fde2f4aa",
        "author": {
          "role": "system",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529223.5867345,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": [""]
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "is_contextual_answers_system_message": true,
          "is_visually_hidden_from_conversation": true,
          "command": "prompt",
          "contextual_answers_message_type": "sources_and_filters_prompt",
          "request_id": "793f93f9-6441-4890-b723-d9fd1a24968e",
          "message_type": "variant",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "parent_id": "5a042604-daaf-44aa-ad64-784d25c02ca5",
          "turn_exchange_id": "d505069e-741a-49e1-9c05-d90f2a98193d",
          "can_save": false
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "5a042604-daaf-44aa-ad64-784d25c02ca5",
      "children": ["ce49dfe8-22d1-49cd-afbb-59f57731d5f9"]
    },
    "c7ec4ae2-b777-487b-885a-c71f98928ef7": {
      "id": "c7ec4ae2-b777-487b-885a-c71f98928ef7",
      "message": {
        "id": "c7ec4ae2-b777-487b-885a-c71f98928ef7",
        "author": {
          "role": "assistant",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529091.7872317,
        "update_time": null,
        "content": {
          "content_type": "model_editable_context",
          "model_set_context": "",
          "repository": null,
          "repo_summary": null,
          "structured_context": null
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "search_result_groups": [],
          "request_id": "6e26ad28-6224-4cd5-a464-b1ac44af1a7c",
          "message_type": "next",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "can_save": false,
          "parent_id": "2cc2cb60-9b84-44f3-b325-c4e90873ef48",
          "turn_exchange_id": "1082db3e-16f9-4a30-8409-3928a3617fb5",
          "model_switcher_deny": []
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "2cc2cb60-9b84-44f3-b325-c4e90873ef48",
      "children": ["873be943-51c5-4c9c-a7cf-2f16710e2bec"]
    },
    "ce49dfe8-22d1-49cd-afbb-59f57731d5f9": {
      "id": "ce49dfe8-22d1-49cd-afbb-59f57731d5f9",
      "message": {
        "id": "ce49dfe8-22d1-49cd-afbb-59f57731d5f9",
        "author": {
          "role": "assistant",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529223.6418169,
        "update_time": null,
        "content": {
          "content_type": "model_editable_context",
          "model_set_context": "",
          "repository": null,
          "repo_summary": null,
          "structured_context": null
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "search_result_groups": [],
          "request_id": "793f93f9-6441-4890-b723-d9fd1a24968e",
          "message_type": "variant",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "can_save": false,
          "parent_id": "3cf9ea42-cb71-4506-a68b-7775fde2f4aa",
          "turn_exchange_id": "d505069e-741a-49e1-9c05-d90f2a98193d",
          "model_switcher_deny": []
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "3cf9ea42-cb71-4506-a68b-7775fde2f4aa",
      "children": ["3d7f39e8-0ae5-4904-8ae7-8edc5f1b982d"]
    },
    "873be943-51c5-4c9c-a7cf-2f16710e2bec": {
      "id": "873be943-51c5-4c9c-a7cf-2f16710e2bec",
      "message": {
        "id": "873be943-51c5-4c9c-a7cf-2f16710e2bec",
        "author": {
          "role": "assistant",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529091.811813,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": [
            "你好 👋  \n\n你说“测试重新生成”，我这边已经正常响应了。  \n\n如果你是想测试：  \n- 🔄 重新生成上一条回答  \n- 📝 测试系统是否正常  \n- 🧪 或者测试某个具体功能  \n\n可以具体告诉我你想测试什么，我配合你一起测 😊"
          ]
        },
        "status": "finished_successfully",
        "end_turn": true,
        "weight": 1.0,
        "metadata": {
          "finish_details": {
            "type": "stop",
            "stop_tokens": [200002]
          },
          "is_complete": true,
          "citations": [],
          "content_references": [],
          "resolved_model_slug": "gpt-5-2",
          "search_result_groups": [],
          "request_id": "6e26ad28-6224-4cd5-a464-b1ac44af1a7c",
          "message_type": "next",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "can_save": true,
          "parent_id": "c7ec4ae2-b777-487b-885a-c71f98928ef7",
          "turn_exchange_id": "1082db3e-16f9-4a30-8409-3928a3617fb5",
          "token_count": 78,
          "model_switcher_deny": []
        },
        "recipient": "all",
        "channel": "final"
      },
      "parent": "c7ec4ae2-b777-487b-885a-c71f98928ef7",
      "children": []
    },
    "3d7f39e8-0ae5-4904-8ae7-8edc5f1b982d": {
      "id": "3d7f39e8-0ae5-4904-8ae7-8edc5f1b982d",
      "message": {
        "id": "3d7f39e8-0ae5-4904-8ae7-8edc5f1b982d",
        "author": {
          "role": "assistant",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529223.652675,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": [
            "好的，我们再来一次 😊  \n\n请告诉我这次你希望我重新生成什么内容？  \n- 文案  \n- 图片  \n- 代码  \n- 总结  \n- 还是别的内容？  \n\n把具体要求发我，我马上重新生成。"
          ]
        },
        "status": "finished_successfully",
        "end_turn": true,
        "weight": 1.0,
        "metadata": {
          "finish_details": {
            "type": "stop",
            "stop_tokens": [200002]
          },
          "is_complete": true,
          "citations": [],
          "content_references": [],
          "resolved_model_slug": "gpt-5-2",
          "search_result_groups": [],
          "request_id": "793f93f9-6441-4890-b723-d9fd1a24968e",
          "message_type": "variant",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "can_save": true,
          "parent_id": "ce49dfe8-22d1-49cd-afbb-59f57731d5f9",
          "turn_exchange_id": "d505069e-741a-49e1-9c05-d90f2a98193d",
          "token_count": 58,
          "model_switcher_deny": []
        },
        "recipient": "all",
        "channel": "final"
      },
      "parent": "ce49dfe8-22d1-49cd-afbb-59f57731d5f9",
      "children": ["8b93fdf4-135a-443e-8e24-ba3ac2e3ef7a"]
    },
    "8b93fdf4-135a-443e-8e24-ba3ac2e3ef7a": {
      "id": "8b93fdf4-135a-443e-8e24-ba3ac2e3ef7a",
      "message": {
        "id": "8b93fdf4-135a-443e-8e24-ba3ac2e3ef7a",
        "author": {
          "role": "user",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529346.603,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": ["你好"]
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "developer_mode_connector_ids": [],
          "selected_sources": [],
          "selected_github_repos": [],
          "serialization_metadata": {
            "custom_symbol_offsets": []
          },
          "request_id": "091d3f23-4d27-483b-90f3-ccab238afb02",
          "message_source": null,
          "turn_exchange_id": "467682a8-1a8a-4e3c-af72-a34c35d32ca7",
          "resolved_model_slug": "gpt-5-2",
          "can_save": false
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "3d7f39e8-0ae5-4904-8ae7-8edc5f1b982d",
      "children": ["2b9d250d-3f8b-41a5-99fd-3de86c2aa6a2"]
    },
    "2b9d250d-3f8b-41a5-99fd-3de86c2aa6a2": {
      "id": "2b9d250d-3f8b-41a5-99fd-3de86c2aa6a2",
      "message": {
        "id": "2b9d250d-3f8b-41a5-99fd-3de86c2aa6a2",
        "author": {
          "role": "system",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529347.0949275,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": [""]
        },
        "status": "finished_successfully",
        "end_turn": null,
        "weight": 1.0,
        "metadata": {
          "is_contextual_answers_system_message": true,
          "is_visually_hidden_from_conversation": true,
          "command": "prompt",
          "contextual_answers_message_type": "sources_and_filters_prompt",
          "request_id": "091d3f23-4d27-483b-90f3-ccab238afb02",
          "message_type": "next",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "parent_id": "8b93fdf4-135a-443e-8e24-ba3ac2e3ef7a",
          "turn_exchange_id": "467682a8-1a8a-4e3c-af72-a34c35d32ca7",
          "can_save": false
        },
        "recipient": "all",
        "channel": null
      },
      "parent": "8b93fdf4-135a-443e-8e24-ba3ac2e3ef7a",
      "children": ["7bd3ef18-3283-4c45-81eb-37f425db2dc6"]
    },
    "7bd3ef18-3283-4c45-81eb-37f425db2dc6": {
      "id": "7bd3ef18-3283-4c45-81eb-37f425db2dc6",
      "message": {
        "id": "7bd3ef18-3283-4c45-81eb-37f425db2dc6",
        "author": {
          "role": "assistant",
          "name": null,
          "metadata": {}
        },
        "create_time": 1772529347.157784,
        "update_time": null,
        "content": {
          "content_type": "text",
          "parts": ["你好，Kevin 👋  \n\n今天想聊点什么？"]
        },
        "status": "finished_successfully",
        "end_turn": true,
        "weight": 1.0,
        "metadata": {
          "finish_details": {
            "type": "stop",
            "stop_tokens": [200002]
          },
          "is_complete": true,
          "citations": [],
          "content_references": [],
          "resolved_model_slug": "gpt-5-2",
          "search_result_groups": [],
          "request_id": "091d3f23-4d27-483b-90f3-ccab238afb02",
          "message_type": "next",
          "model_slug": "gpt-5-2",
          "default_model_slug": "gpt-5-2",
          "can_save": true,
          "parent_id": "2b9d250d-3f8b-41a5-99fd-3de86c2aa6a2",
          "turn_exchange_id": "467682a8-1a8a-4e3c-af72-a34c35d32ca7",
          "token_count": 16,
          "model_switcher_deny": []
        },
        "recipient": "all",
        "channel": "final"
      },
      "parent": "2b9d250d-3f8b-41a5-99fd-3de86c2aa6a2",
      "children": []
    }
  },
  "moderation_results": [],
  "current_node": "7bd3ef18-3283-4c45-81eb-37f425db2dc6",
  "plugin_ids": null,
  "conversation_id": "69a6a5b7-811c-83a2-906c-9b1ed45179d6",
  "conversation_template_id": null,
  "gizmo_id": null,
  "gizmo_type": null,
  "is_archived": false,
  "is_starred": null,
  "safe_urls": [
    "https://www.notion.so/9162f50b62b080124ca4db47ba6f2e54",
    "https://github.com/my_company/my-private-repo/blob/main/examples/README.md",
    "https://chatgpt.com/apps",
    "https://docs.google.com/spreadsheets/d/1HmkfBJulhu50S6L9wuRsaVC9VL1LpbxpmgRzn33SxsQ/edit?gid=676408861#gid=676408861",
    "https://www.openai.com",
    "https://docs.google.com/document/d/1WF0NB9fnxhDPEi_arGSp18Kev9KXdoX-IePIE8KJgCQ/edit?tab=t.0#heading=h.e3mmf6q9l82j",
    "https://codexcn.com",
    "https://docs.google.com/document/d/1WF0NB9fnxhDPEi_arGSp18Kev9KXdoX-IePIE8KJgCQ",
    "https://github.com/some_company/some-private-repo/blob/main/examples/README.md"
  ],
  "blocked_urls": [],
  "default_model_slug": "gpt-5-2",
  "atlas_mode_enabled": null,
  "conversation_origin": null,
  "is_read_only": null,
  "voice": null,
  "async_status": null,
  "disabled_tool_ids": [],
  "is_do_not_remember": false,
  "memory_scope": "global_enabled",
  "context_scopes": null,
  "sugar_item_id": null,
  "sugar_item_visible": false,
  "pinned_time": null,
  "is_study_mode": false,
  "owner": null
}
```

SSE payload

```typescript
{
    messages: [
    {
        "id": "fae1e179-a947-4f93-b795-98afc74c17bd",
        "author": {
            "role": "user"
        },
        "create_time": 1772530502.173,
        "content": {
            "content_type": "text",
            "parts": [
                "1"
            ]
        },
        "metadata": {
            "developer_mode_connector_ids": [],
            "selected_connector_ids": [],
            "selected_sync_knowledge_store_ids": [],
            "selected_sources": [],
            "selected_github_repos": [],
            "selected_all_github_repos": false,
            "serialization_metadata": {
                "custom_symbol_offsets": []
            }
        }
    ],
    parent_message_id: "client-created-root"
}
```
