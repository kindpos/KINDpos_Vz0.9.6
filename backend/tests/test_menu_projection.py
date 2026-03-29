"""
Menu Projection Tests
=====================
Exercises project_menu() with all 12 event types it handles:
  - Legacy batch: RESTAURANT_CONFIGURED, TAX_RULES_BATCH_CREATED,
                  CATEGORIES_BATCH_CREATED, ITEMS_BATCH_CREATED
  - Granular CRUD: MENU_CATEGORY_CREATED/UPDATED, MENU_ITEM_CREATED/UPDATED/DELETED,
                   MODIFIER_GROUP_CREATED/UPDATED/DELETED
"""

import pytest
from app.core.events import Event, EventType, create_event
from app.core.menu_projection import project_menu, MenuState

T = "terminal_01"


def _evt(event_type: EventType, payload: dict) -> Event:
    return create_event(event_type=event_type, terminal_id=T, payload=payload)


# ── Legacy batch events ──────────────────────────────────────────────


class TestLegacyBatchEvents:

    def test_restaurant_configured(self):
        events = [
            _evt(EventType.RESTAURANT_CONFIGURED, {
                "name": "Kind Cafe",
                "address": "123 Main St",
                "import_id": "should_be_stripped",
            }),
        ]
        state = project_menu(events)
        assert state.restaurant["name"] == "Kind Cafe"
        assert state.restaurant["address"] == "123 Main St"
        assert "import_id" not in state.restaurant

    def test_tax_rules_batch(self):
        events = [
            _evt(EventType.TAX_RULES_BATCH_CREATED, {
                "tax_rules": [
                    {"rule_id": "r1", "name": "State", "rate": 0.07},
                    {"rule_id": "r2", "name": "Local", "rate": 0.02},
                ],
            }),
        ]
        state = project_menu(events)
        assert len(state.tax_rules) == 2
        assert state.tax_rules[0]["name"] == "State"

    def test_categories_batch(self):
        events = [
            _evt(EventType.CATEGORIES_BATCH_CREATED, {
                "categories": [
                    {"category_id": "c1", "name": "Appetizers", "display_order": 1},
                    {"category_id": "c2", "name": "Entrees", "display_order": 2},
                ],
            }),
        ]
        state = project_menu(events)
        assert len(state.categories) == 2
        assert state.categories[0]["name"] == "Appetizers"
        assert state.categories[1]["name"] == "Entrees"

    def test_items_batch(self):
        events = [
            _evt(EventType.ITEMS_BATCH_CREATED, {
                "items": [
                    {"item_id": "i1", "name": "Fries", "price": 5.99, "category": "Appetizers"},
                    {"item_id": "i2", "name": "Burger", "price": 12.99, "category": "Entrees"},
                ],
            }),
        ]
        state = project_menu(events)
        assert len(state.items) == 2
        assert state.items_by_category["Appetizers"][0]["name"] == "Fries"
        assert state.items_by_category["Entrees"][0]["name"] == "Burger"


# ── Granular category CRUD ───────────────────────────────────────────


class TestGranularCategoryCRUD:

    def test_create_category(self):
        events = [
            _evt(EventType.MENU_CATEGORY_CREATED, {
                "category_id": "c1", "name": "Salads", "display_order": 1,
            }),
        ]
        state = project_menu(events)
        assert len(state.categories) == 1
        assert state.categories[0]["name"] == "Salads"

    def test_update_category(self):
        events = [
            _evt(EventType.MENU_CATEGORY_CREATED, {
                "category_id": "c1", "name": "Salads", "display_order": 1,
            }),
            _evt(EventType.MENU_CATEGORY_UPDATED, {
                "category_id": "c1", "name": "Fresh Salads",
            }),
        ]
        state = project_menu(events)
        assert state.categories[0]["name"] == "Fresh Salads"

    def test_update_nonexistent_category_is_noop(self):
        events = [
            _evt(EventType.MENU_CATEGORY_UPDATED, {
                "category_id": "ghost", "name": "Nope",
            }),
        ]
        state = project_menu(events)
        assert len(state.categories) == 0

    def test_categories_sorted_by_display_order(self):
        events = [
            _evt(EventType.MENU_CATEGORY_CREATED, {
                "category_id": "c2", "name": "Entrees", "display_order": 2,
            }),
            _evt(EventType.MENU_CATEGORY_CREATED, {
                "category_id": "c1", "name": "Apps", "display_order": 1,
            }),
        ]
        state = project_menu(events)
        assert state.categories[0]["name"] == "Apps"
        assert state.categories[1]["name"] == "Entrees"


# ── Granular item CRUD ───────────────────────────────────────────────


class TestGranularItemCRUD:

    def test_create_item(self):
        events = [
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i1", "name": "Wings", "price": 11.99, "category": "Apps",
            }),
        ]
        state = project_menu(events)
        assert len(state.items) == 1
        assert state.items[0]["name"] == "Wings"
        assert state.items_by_category["Apps"][0]["price"] == 11.99

    def test_update_item(self):
        events = [
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i1", "name": "Wings", "price": 11.99, "category": "Apps",
            }),
            _evt(EventType.MENU_ITEM_UPDATED, {
                "item_id": "i1", "price": 13.99,
            }),
        ]
        state = project_menu(events)
        assert state.items[0]["price"] == 13.99

    def test_delete_item(self):
        events = [
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i1", "name": "Wings", "price": 11.99, "category": "Apps",
            }),
            _evt(EventType.MENU_ITEM_DELETED, {"item_id": "i1"}),
        ]
        state = project_menu(events)
        assert len(state.items) == 0
        assert "Apps" not in state.items_by_category

    def test_delete_nonexistent_item_is_noop(self):
        events = [
            _evt(EventType.MENU_ITEM_DELETED, {"item_id": "ghost"}),
        ]
        state = project_menu(events)
        assert len(state.items) == 0

    def test_update_nonexistent_item_is_noop(self):
        events = [
            _evt(EventType.MENU_ITEM_UPDATED, {"item_id": "ghost", "price": 99.99}),
        ]
        state = project_menu(events)
        assert len(state.items) == 0

    def test_items_by_category_grouping(self):
        events = [
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i1", "name": "Fries", "price": 5.99, "category": "Apps",
            }),
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i2", "name": "Nachos", "price": 9.99, "category": "Apps",
            }),
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i3", "name": "Steak", "price": 29.99, "category": "Entrees",
            }),
        ]
        state = project_menu(events)
        assert len(state.items_by_category["Apps"]) == 2
        assert len(state.items_by_category["Entrees"]) == 1

    def test_item_without_category_goes_to_uncategorized(self):
        events = [
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i1", "name": "Mystery", "price": 7.00,
            }),
        ]
        state = project_menu(events)
        assert "Uncategorized" in state.items_by_category


# ── Modifier group CRUD ─────────────────────────────────────────────


class TestModifierGroupCRUD:

    def test_create_modifier_group(self):
        events = [
            _evt(EventType.MODIFIER_GROUP_CREATED, {
                "group_id": "mg1", "name": "Temperatures",
                "options": ["Rare", "Medium", "Well Done"],
            }),
        ]
        state = project_menu(events)
        assert len(state.modifier_groups) == 1
        assert state.modifier_groups[0]["name"] == "Temperatures"

    def test_update_modifier_group(self):
        events = [
            _evt(EventType.MODIFIER_GROUP_CREATED, {
                "group_id": "mg1", "name": "Temps",
                "options": ["Rare", "Medium"],
            }),
            _evt(EventType.MODIFIER_GROUP_UPDATED, {
                "group_id": "mg1", "name": "Temperatures",
                "options": ["Rare", "Medium Rare", "Medium", "Well Done"],
            }),
        ]
        state = project_menu(events)
        assert state.modifier_groups[0]["name"] == "Temperatures"
        assert len(state.modifier_groups[0]["options"]) == 4

    def test_delete_modifier_group(self):
        events = [
            _evt(EventType.MODIFIER_GROUP_CREATED, {
                "group_id": "mg1", "name": "Temps", "options": [],
            }),
            _evt(EventType.MODIFIER_GROUP_DELETED, {"group_id": "mg1"}),
        ]
        state = project_menu(events)
        assert len(state.modifier_groups) == 0

    def test_delete_nonexistent_modifier_group_is_noop(self):
        events = [
            _evt(EventType.MODIFIER_GROUP_DELETED, {"group_id": "ghost"}),
        ]
        state = project_menu(events)
        assert len(state.modifier_groups) == 0

    def test_update_nonexistent_modifier_group_is_noop(self):
        events = [
            _evt(EventType.MODIFIER_GROUP_UPDATED, {
                "group_id": "ghost", "name": "Nope",
            }),
        ]
        state = project_menu(events)
        assert len(state.modifier_groups) == 0


# ── Mixed batch + granular ───────────────────────────────────────────


class TestMixedBatchAndGranular:

    def test_batch_then_granular_overlay(self):
        """Batch import followed by granular updates merges correctly."""
        events = [
            _evt(EventType.RESTAURANT_CONFIGURED, {"name": "Kind Cafe"}),
            _evt(EventType.CATEGORIES_BATCH_CREATED, {
                "categories": [
                    {"category_id": "c1", "name": "Apps", "display_order": 1},
                ],
            }),
            _evt(EventType.ITEMS_BATCH_CREATED, {
                "items": [
                    {"item_id": "i1", "name": "Fries", "price": 5.99, "category": "Apps"},
                ],
            }),
            # Granular overlay: rename category, update price, add new item
            _evt(EventType.MENU_CATEGORY_UPDATED, {
                "category_id": "c1", "name": "Starters",
            }),
            _evt(EventType.MENU_ITEM_UPDATED, {
                "item_id": "i1", "price": 6.99,
            }),
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i2", "name": "Soup", "price": 4.99, "category": "Starters",
            }),
        ]
        state = project_menu(events)
        assert state.restaurant["name"] == "Kind Cafe"
        assert state.categories[0]["name"] == "Starters"
        assert len(state.items) == 2
        fries = next(i for i in state.items if i["item_id"] == "i1")
        assert fries["price"] == 6.99

    def test_empty_event_list(self):
        state = project_menu([])
        assert isinstance(state, MenuState)
        assert state.categories == []
        assert state.items == []
        assert state.modifier_groups == []
        assert state.tax_rules == []

    def test_unrelated_events_ignored(self):
        """Events the projection doesn't handle should be silently skipped."""
        events = [
            _evt(EventType.ORDER_CREATED, {"order_id": "o1"}),
            _evt(EventType.MENU_ITEM_CREATED, {
                "item_id": "i1", "name": "Taco", "price": 3.99, "category": "Mex",
            }),
        ]
        state = project_menu(events)
        assert len(state.items) == 1
