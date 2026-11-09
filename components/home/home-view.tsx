"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  LayoutDashboard,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ParsleyMark, TAGLINE, brandClassName } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeekMeals, CompactDinners } from "@/components/home/week-meals";
import { PantryPreview } from "@/components/home/pantry-preview";
import {
  ShoppingWidget,
  type ShoppingPreviewItem,
} from "@/components/home/shopping-widget";
import { SmartActions } from "@/components/home/smart-actions";
import { LeftoversWidget } from "@/components/home/leftovers-widget";
import { SnackWidget } from "@/components/home/snack-widget";
import { NewToTryWidget } from "@/components/home/new-to-try-widget";
import { PantryInsights } from "@/components/home/pantry-insights";
import { MiniCalendar } from "@/components/home/mini-calendar";
import { QuickBitesWidget } from "@/components/home/quick-bites-widget";
import { StatsSummary } from "@/components/stats/stats-summary";
import { saveDashboardWidgetOrder } from "@/app/(app)/home/actions";
import {
  DEFAULT_DASHBOARD_ORDER,
  type DashboardWidgetId,
} from "@/lib/dashboard-order";
import type { RecipeOption } from "@/components/plan/day-dialog";
import type {
  CategoryRow,
  CustomMealRow,
  HomeMeal,
  HouseholdSettingsRow,
  InventoryEntry,
  LeftoverRow,
  NewToTryEntry,
  StoreAisleRow,
  StoreRow,
  SubcategoryRow,
} from "@/lib/types";

function PromoCard() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm dark:from-emerald-950/50 dark:to-teal-950/40">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-sm font-extrabold">Meal planning made simple</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className={brandClassName}>{TAGLINE}</span>
          </p>
        </div>
      </div>
      <ParsleyMark className="pointer-events-none absolute -right-3 -bottom-3 h-20 w-24 opacity-30" />
    </section>
  );
}

const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  "smart-actions": "Smart Actions",
  leftovers: "Leftovers",
  snacks: "Snacks",
  "new-to-try": "New to Try",
  "quick-bites": "Quick Bites",
  "pantry-insights": "Pantry Insights",
  "mini-calendar": "Mini Calendar",
  stats: "Stats Summary",
  promo: "Meal planning made simple",
  pantry: "Pantry",
  shopping: "Shopping List",
};

function SortableWidget({
  id,
  editing,
  children,
}: {
  id: DashboardWidgetId;
  editing: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editing });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "mb-4 w-full min-w-0 break-inside-avoid",
        editing && "relative rounded-2xl ring-2 ring-primary/40",
        isDragging && "z-30 opacity-95 shadow-xl",
      )}
    >
      {editing ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag ${WIDGET_LABELS[id]} to reorder`}
          title={`Drag ${WIDGET_LABELS[id]} to reorder`}
          className="absolute top-2 left-2 z-20 cursor-grab touch-none rounded-md border bg-background/90 p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      <div className={editing ? "pointer-events-none select-none" : ""}>
        {children}
      </div>
    </div>
  );
}

export function HomeView({
  meals,
  pantry,
  categories,
  subcategories,
  grocery,
  stores,
  aisles,
  assignments,
  rememberedAisles,
  itemStores,
  settings,
  recipes,
  customMeals,
  recipeTypeById,
  recipeIngredients,
  leftovers,
  newToTry,
  initialOrder,
}: {
  meals: HomeMeal[];
  pantry: InventoryEntry[];
  categories: CategoryRow[];
  subcategories: SubcategoryRow[];
  grocery: ShoppingPreviewItem[];
  stores: StoreRow[];
  aisles: StoreAisleRow[];
  assignments: { grocery_item_id: string; store_id: string; aisle_id: string }[];
  rememberedAisles: { item_id: string; store_id: string; aisle_id: string }[];
  itemStores: { grocery_item_id: string; store_id: string }[];
  settings: HouseholdSettingsRow | null;
  recipes: RecipeOption[];
  customMeals?: CustomMealRow[];
  recipeTypeById?: Map<string, string>;
  recipeIngredients: Array<{
    recipe_id: string;
    item_id: string;
    name: string;
    quantity_text: string;
    optional: boolean;
  }>;
  leftovers: LeftoverRow[] | null;
  newToTry: NewToTryEntry[];
  initialOrder: DashboardWidgetId[];
}) {
  const router = useRouter();
  const [savedOrder, setSavedOrder] = useState<DashboardWidgetId[]>(initialOrder);
  const [draftOrder, setDraftOrder] = useState<DashboardWidgetId[]>(initialOrder);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragStartOrderRef = useRef<DashboardWidgetId[]>(initialOrder);
  const savedOrderRef = useRef(savedOrder);

  useEffect(() => {
    savedOrderRef.current = savedOrder;
  }, [savedOrder]);

  useEffect(() => {
    if (!editing) {
      setSavedOrder(initialOrder);
      setDraftOrder(initialOrder);
    }
  }, [initialOrder, editing]);

  useEffect(() => {
    function onCustomize() {
      setDraftOrder(savedOrderRef.current);
      setEditing(true);
    }
    window.addEventListener("parlseypantry:customize-dashboard", onCustomize);
    return () => {
      window.removeEventListener("parlseypantry:customize-dashboard", onCustomize);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    void event;
    dragStartOrderRef.current = [...draftOrder];
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setDraftOrder((prev) => {
      const from = prev.indexOf(activeId as DashboardWidgetId);
      const to = prev.indexOf(overId as DashboardWidgetId);
      if (from < 0 || to < 0 || from === to) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function handleDragEnd(_event: DragEndEvent) {}

  function handleDragCancel(_event: DragCancelEvent) {
    setDraftOrder(dragStartOrderRef.current);
  }

  function cancelEditing() {
    if (saving) return;
    setDraftOrder(savedOrder);
    setEditing(false);
  }

  function resetToDefault() {
    if (saving) return;
    setDraftOrder([...DEFAULT_DASHBOARD_ORDER]);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const result = await saveDashboardWidgetOrder(draftOrder);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSavedOrder(result.data.order);
    setEditing(false);
    toast.success("Dashboard layout saved");
    router.refresh();
  }

  function renderWidget(id: DashboardWidgetId) {
    switch (id) {
      case "smart-actions":
        return (
          <SmartActions pantry={pantry} grocery={grocery} meals={meals} recipes={recipes} />
        );
      case "leftovers":
        return <LeftoversWidget rows={leftovers} />;
      case "snacks":
        return (
          <SnackWidget
            rows={pantry}
            subcategories={subcategories}
            selectedItemIds={settings?.home_snack_item_ids ?? []}
          />
        );
      case "new-to-try":
        return (
          <NewToTryWidget
            rows={newToTry}
            recipes={recipes}
            recipeTypeById={recipeTypeById}
          />
        );
      case "quick-bites":
        return (
          <QuickBitesWidget
            recipes={recipes}
            recipeIngredients={recipeIngredients}
            pantry={pantry}
          />
        );
      case "pantry-insights":
        return <PantryInsights rows={pantry} subcategories={subcategories} />;
      case "mini-calendar":
        return <MiniCalendar meals={meals} recipes={recipes} />;
      case "stats":
        return <StatsSummary meals={meals} recipeTypeById={recipeTypeById} />;
      case "promo":
        return <PromoCard />;
      case "pantry":
        return <PantryPreview rows={pantry} />;
      case "shopping":
        return (
          <ShoppingWidget
            items={grocery}
            categories={categories}
            stores={stores}
            aisles={aisles}
            assignments={assignments}
            rememberedAisles={rememberedAisles}
            itemStores={itemStores}
            settings={settings}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div>
      {editing ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="text-sm font-extrabold">Editing Dashboard</h2>
              <p className="text-sm text-muted-foreground">
                Drag and drop widgets to arrange your dashboard. Your changes
                won&apos;t be saved until you click Save.
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetToDefault}
              disabled={saving}
            >
              Reset to Default
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cancelEditing}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      ) : null}

      <div className={editing ? "mb-4 pointer-events-none select-none" : "mb-4"}>
        <div className="lg:hidden">
          <CompactDinners meals={meals} recipes={recipes} customMeals={customMeals} />
        </div>
        <div className="hidden lg:block">
          <WeekMeals meals={meals} recipes={recipes} customMeals={customMeals} />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={draftOrder} strategy={rectSortingStrategy}>
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {draftOrder.map((id) => (
              <SortableWidget key={id} id={id} editing={editing}>
                {renderWidget(id)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
