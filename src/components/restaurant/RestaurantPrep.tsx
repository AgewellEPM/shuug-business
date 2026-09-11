"use client";
import { useState, type ReactNode } from "react";
import type { restaurantManagementData } from "@/lib/restaurant/management";
import type { PrepBatch, PrepRecipe } from "@/lib/restaurant/prep-model";

type Data = ReturnType<typeof restaurantManagementData>;
type Command = (action: string, input: unknown) => Promise<boolean>;
type Props = { data: Data; command: Command; disabled: boolean };
const field = "dd-input mt-1 block w-full";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm">{label}{children}</label>; }
function Quantity({ label, name, amount }: { label: string; name: string; amount?: number }) { return <Field label={label}><input className={field} type="number" name={name} min="1" max="1000000000" step="1" defaultValue={amount} required/></Field>; }

export function RestaurantPrep({ data, command, disabled }: Props) {
  const [recipeId, setRecipeId] = useState("");
  const recipes = data.prepRecipes ?? [], batches = data.prepBatches ?? [], selected = recipes.find(r => r.id === recipeId);
  const pending = batches.filter(b => b.status === "preparing"), finished = batches.filter(b => b.status !== "preparing");
  return <div className="space-y-5">
    <section className="dd-card space-y-3"><h2 className="text-xl font-semibold">Kitchen prep and measured yields</h2>
      <p>Make prepared ingredients such as sauce or dough from the stock you actually use. Record the measured finished quantity before it becomes available to menu orders.</p>
      <p className="text-sm">{pending.length} batches in preparation · {money(pending.reduce((n, b) => n + b.foodCost, 0))} ingredient cost in progress · {finished.length} completed or discarded batches</p>
      <p className="text-sm">Add the prepared output as an <a className="underline" href="/restaurant/manage?tab=stock">ingredient</a>, then use it in <a className="underline" href="/restaurant/manage?tab=menu">menu recipes</a>. Costs follow the source lots. Labor and overhead are separate from food cost.</p>
    </section>
    <details className="dd-card"><summary className="cursor-pointer font-semibold">Create a prep recipe</summary><RecipeForm {...{ data, command, disabled }}/></details>
    <section className="dd-card space-y-4"><h2 className="text-xl font-semibold">Start a prep batch</h2>
      <Field label="Prep recipe"><select className={field} value={recipeId} onChange={e => setRecipeId(e.target.value)} disabled={disabled}><option value="">Choose a recipe</option>{recipes.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      {selected && <StartForm key={`${selected.id}:${selected.revision}`} {...{ data, command, disabled }} recipe={selected}/>}
      {!recipes.some(r => r.active) && <p className="text-sm">Create a prep recipe to connect raw ingredients to a finished ingredient.</p>}
    </section>
    <section className="dd-card space-y-4"><h2 className="text-xl font-semibold">Batches in preparation</h2>
      {!pending.length && <p>No unfinished batches.</p>}
      {pending.slice().reverse().map(batch => <article key={`${batch.id}:${batch.revision}`} className="space-y-4 rounded-lg border p-4"><BatchDetails batch={batch} data={data}/><FinishForm batch={batch} command={command} disabled={disabled}/></article>)}
    </section>
    <section className="dd-card space-y-4"><h2 className="text-xl font-semibold">Prep history and yield differences</h2>
      <p className="text-sm">Yield compares actual output with the recipe&apos;s planned output in the same unit. Lower yield raises cost per finished unit. This is not a comparison of unlike ingredient weights or volumes. Normal preparation loss stays in the output&apos;s cost; a fully discarded batch is a food loss.</p>
      {!finished.length && <p>No completed batches yet.</p>}
      {finished.slice().reverse().map(batch => <article className="space-y-3 rounded-lg border p-4" key={batch.id}><BatchDetails batch={batch} data={data}/>
        <p><strong>{batch.status === "discarded" ? "Discarded" : `Measured output: ${batch.actualQuantity} ${batch.output.unit}`}</strong> · {((batch.actualQuantity ?? 0) / batch.expectedQuantity * 100).toFixed(1)}% of planned output</p>
        {batch.status === "completed" && <p className="text-sm">Use by {batch.expires} · {money(batch.foodCost * 1000 / batch.actualQuantity!)} per 1,000 {batch.output.unit} · <a className="underline" href="/restaurant/manage?tab=stock">View prepared stock</a></p>}
        <p className="text-sm">{batch.completedDate} · {batch.completedBy} · {batch.completionEvidence}</p>
      </article>)}
    </section>
    <details className="dd-card"><summary className="cursor-pointer font-semibold">Prep recipes · {recipes.length}</summary><div className="mt-4 space-y-4">{recipes.map(recipe => <details className="rounded-lg border p-4" key={`${recipe.id}:${recipe.revision}`}><summary className="cursor-pointer font-semibold">{recipe.name} · revision {recipe.revision} · {recipe.active ? "Active" : "Inactive"}</summary><p className="my-3 text-sm">Changes apply to future batches. Existing batches retain their recipe and measured ingredients.</p><RecipeForm {...{ data, command, disabled }} recipe={recipe}/></details>)}</div></details>
  </div>;
}

function RecipeForm({ data, recipe, command, disabled }: Props & { recipe?: PrepRecipe }) {
  const [outputId, setOutputId] = useState(recipe?.outputIngredientId ?? "");
  const blank = () => ({ ingredientId: "", quantity: "" });
  const [inputs, setInputs] = useState(recipe?.inputs.map(i => ({ ingredientId: i.ingredientId, quantity: String(i.quantity) })) ?? [blank()]);
  const output = data.ingredients.find(i => i.id === outputId);
  return <form className="mt-4 space-y-4" onSubmit={async e => {
    e.preventDefault(); const form = e.currentTarget, f = new FormData(form);
    const ok = await command("prep.recipe.save", { ...(recipe ? { id: recipe.id, revision: recipe.revision } : {}), name: text(f, "name"), outputIngredientId: outputId, expectedQuantity: Number(text(f, "expectedQuantity")), inputs: inputs.map(i => ({ ingredientId: i.ingredientId, quantity: Number(i.quantity) })), instructions: text(f, "instructions"), active: f.has("active") });
    if (ok && !recipe) { form.reset(); setOutputId(""); setInputs([blank()]); }
  }}><fieldset className="space-y-4" disabled={disabled}>
    <Field label="Prep recipe name"><input className={field} name="name" maxLength={100} defaultValue={recipe?.name} required/></Field>
    <Field label="Prepared output ingredient"><select className={field} value={outputId} onChange={e => setOutputId(e.target.value)} required><option value="">Choose prepared ingredient</option>{data.ingredients.filter(i => i.active || i.id === outputId).map(i => <option key={i.id} value={i.id}>{i.name} · {i.unit}</option>)}</select></Field>
    <Quantity label={`Expected output per batch (${output?.unit ?? "base units"})`} name="expectedQuantity" amount={recipe?.expectedQuantity}/>
    <p className="text-sm">Enter whole grams, milliliters or individual units according to each ingredient&apos;s stock unit. For example, enter 1,000 for one kilogram of an ingredient tracked in grams.</p>
    {inputs.map((line, index) => <div className="grid gap-3 rounded border p-3 sm:grid-cols-[1fr_1fr_auto]" key={index}>
      <Field label={`Input ingredient ${index + 1}`}><select className={field} value={line.ingredientId} onChange={e => setInputs(inputs.map((l, n) => n === index ? { ...l, ingredientId: e.target.value } : l))} required><option value="">Choose ingredient</option>{data.ingredients.filter(i => i.id !== outputId && (i.active || i.id === line.ingredientId)).map(i => <option key={i.id} value={i.id}>{i.name} · {i.unit}</option>)}</select></Field>
      <Field label={`Input quantity ${index + 1}`}><input className={field} type="number" min="1" max="1000000000" step="1" value={line.quantity} onChange={e => setInputs(inputs.map((l, n) => n === index ? { ...l, quantity: e.target.value } : l))} required/></Field>
      <button className="dd-secondary self-end" type="button" disabled={inputs.length === 1} onClick={() => setInputs(inputs.filter((_, n) => n !== index))}>Remove input {index + 1}</button>
    </div>)}
    <button className="dd-secondary" type="button" disabled={inputs.length >= 100} onClick={() => setInputs([...inputs, blank()])}>Add prep input</button>
    <Field label="Preparation instructions and allergen notes"><textarea className={field} name="instructions" maxLength={5000} defaultValue={recipe?.instructions} rows={4}/></Field>
    <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={recipe?.active ?? true}/>Active prep recipe</label>
    <button className="dd-primary">{recipe ? "Save prep recipe" : "Create prep recipe"}</button>
  </fieldset></form>;
}

function StartForm({ data, recipe, command, disabled }: Props & { recipe: PrepRecipe }) {
  const [batches, setBatches] = useState(1);
  const output = data.ingredients.find(i => i.id === recipe.outputIngredientId)!;
  return <form className="space-y-4" onSubmit={async e => {
    e.preventDefault(); const form = e.currentTarget, f = new FormData(form);
    if (await command("prep.start", { recipeId: recipe.id, recipeRevision: recipe.revision, batches, reference: text(f, "reference"), inputs: recipe.inputs.map(i => ({ ingredientId: i.ingredientId, quantity: Number(text(f, i.ingredientId)) })), evidence: text(f, "evidence"), reviewed: true })) { form.reset(); setBatches(1); }
  }}><fieldset disabled={disabled} className="space-y-4">
    <Field label="Unique batch reference"><input className={field} name="reference" maxLength={100} required/></Field>
    <Field label="Recipe batches to prepare"><input className={field} type="number" min="1" max="1000" step="1" value={batches} onChange={e => setBatches(Number(e.target.value))} required/></Field>
    <p>Planned output: {recipe.expectedQuantity * batches} {output?.unit} {output?.name}</p>
    <p className="text-sm">Stock is allocated from the earliest-expiring unexpired lots first. Actual input quantities below can differ from the recipe plan; verify the quantities you take from stock.</p>
    {recipe.instructions && <p className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{recipe.instructions}</p>}
    <div key={batches} className="grid gap-3 sm:grid-cols-2">{recipe.inputs.map(line => {
      const ingredient = data.ingredients.find(i => i.id === line.ingredientId)!;
      return <div key={line.ingredientId}><Quantity label={`Actual ${ingredient.name} used (${ingredient.unit})`} name={line.ingredientId} amount={line.quantity * batches}/><p className="mt-1 text-xs">{ingredient.available} {ingredient.unit} currently available · Planned {line.quantity * batches} {ingredient.unit}</p></div>;
    })}</div>
    <Field label="Batch start evidence"><textarea className={field} name="evidence" minLength={3} maxLength={2000} required/></Field>
    <label className="flex gap-2 text-sm"><input type="checkbox" required/>I checked the measured inputs and selected recipe. These ingredients are going into preparation now.</label>
    <button className="dd-primary">Start batch and use ingredients</button>
  </fieldset></form>;
}

function FinishForm({ batch, command, disabled }: { batch: PrepBatch; command: Command; disabled: boolean }) {
  const [mode, setMode] = useState("complete");
  return <form className="space-y-3" onSubmit={async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    await command(mode === "complete" ? "prep.complete" : "prep.discard", { id: batch.id, revision: batch.revision, ...(mode === "complete" ? { quantity: Number(text(f, "quantity")), expires: text(f, "expires") } : {}), evidence: text(f, "evidence"), reviewed: true });
  }}><fieldset disabled={disabled} className="space-y-3">
    <Field label={`Result for ${batch.reference}`}><select className={field} value={mode} onChange={e => setMode(e.target.value)}><option value="complete">Complete with usable prepared stock</option><option value="discard">Discard the whole batch</option></select></Field>
    <div key={mode} className="space-y-3">{mode === "complete" ? <><Quantity label={`Measured output for ${batch.reference} (${batch.output.unit})`} name="quantity"/><Field label={`Reviewed use-by date for ${batch.reference}`}><input className={field} type="date" name="expires" required/></Field><p className="text-sm">Use your kitchen&apos;s reviewed storage and food-handling rules. The application does not calculate a safe shelf life. Check allergen disclosures before using the prepared ingredient in a menu item.</p></> : <p className="text-sm">Records {money(batch.foodCost)} as discarded food. Original ingredient lots remain consumed and the batch history is retained.</p>}
      <Field label={`Result evidence for ${batch.reference}`}><textarea className={field} name="evidence" minLength={3} maxLength={2000} required/></Field>
      <label className="flex gap-2 text-sm"><input type="checkbox" required/>I verified the {mode === "complete" ? "measured yield, use-by date and release for kitchen use" : "whole-batch disposal and reason"} for {batch.reference}.</label>
    </div>
    <button className="dd-primary">{mode === "complete" ? "Complete batch and receive prepared stock" : "Record discarded batch"}</button>
  </fieldset></form>;
}

function BatchDetails({ batch, data }: { batch: PrepBatch; data: Data }) {
  return <><h3 className="font-semibold">{batch.reference} · {batch.recipe.name}</h3><p className="text-sm">{batch.startedDate} · Started by {batch.startedBy} · {batch.status}<br/>Planned {batch.expectedQuantity} {batch.output.unit} {batch.output.name} · Food cost {money(batch.foodCost)}</p>
    <details><summary className="cursor-pointer text-sm">Recipe, measured inputs and source lots</summary><div className="mt-3 space-y-3 text-sm"><p>Captured recipe revision {batch.recipe.revision} · {batch.batches} batches</p><p className="whitespace-pre-wrap">{batch.recipe.instructions}</p><p>{batch.startEvidence}</p>
      <ul className="list-disc pl-5">{batch.inputs.map(i => <li key={i.ingredientId}>{i.name}: planned {i.plannedQuantity} {i.unit}, used {i.quantity} {i.unit}</li>)}</ul>
      <ul className="list-disc pl-5">{batch.consumed.map((l, index) => <li key={index}>{batch.inputs.find(i => i.ingredientId === l.ingredientId)?.name} · lot {data.lots.find(v => v.id === l.lotId)?.invoiceReference ?? l.lotId} · {l.quantity} units · {money(l.cost)}</li>)}</ul>
    </div></details></>;
}
