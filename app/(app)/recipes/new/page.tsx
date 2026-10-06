import { RecipeEditor } from "@/components/recipes/recipe-editor";

export const metadata = { title: "New recipe" };

export default function NewRecipePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <RecipeEditor recipe={null} ingredients={[]} />
    </div>
  );
}
