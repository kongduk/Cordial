import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeFlavor, mapDbMethod } from "../src/shared/lib/flavorModel";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── IBA Dataset (79 cocktails, 2020 list) ────────────────────────────────────
const IBA_DATA = [
  { name: "ALEXANDER", ingredients: [{ name: "cognac", quantity: 3.0 }, { name: "creme de cacao", quantity: 3.0 }, { name: "cream", quantity: 3.0 }], type: "After Dinner Cocktail" },
  { name: "AMERICANO", ingredients: [{ name: "campari", quantity: 3.0 }, { name: "red vermouth", quantity: 3.0 }, { name: "soda water", quantity: 0.74 }], type: "Before Dinner Cocktail" },
  { name: "ANGEL FACE", ingredients: [{ name: "gin", quantity: 3.0 }, { name: "apricot brandy", quantity: 3.0 }, { name: "calvados", quantity: 3.0 }], type: "All Day Cocktail" },
  { name: "AVIATION", ingredients: [{ name: "gin", quantity: 4.5 }, { name: "maraschino", quantity: 1.5 }, { name: "lemon juice", quantity: 1.5 }], type: "All Day Cocktail" },
  { name: "BACARDI", ingredients: [{ name: "white rum", quantity: 4.5 }, { name: "lime juice", quantity: 2.0 }, { name: "grenadine", quantity: 1.0 }], type: "Before Dinner Cocktail" },
  { name: "BETWEEN THE SHEETS", ingredients: [{ name: "white rum", quantity: 3.0 }, { name: "cognac", quantity: 3.0 }, { name: "triple sec", quantity: 3.0 }, { name: "lemon juice", quantity: 2.0 }], type: "All Day Cocktail" },
  { name: "CASINO", ingredients: [{ name: "old tom gin", quantity: 4.0 }, { name: "maraschino", quantity: 1.0 }, { name: "orange bitters", quantity: 1.0 }, { name: "lemon juice", quantity: 1.0 }], type: "All Day Cocktail" },
  { name: "CLOVER CLUB", ingredients: [{ name: "gin", quantity: 4.5 }, { name: "raspberry syrup", quantity: 1.5 }, { name: "lemon juice", quantity: 1.5 }, { name: "egg white", quantity: 0.5 }], type: "All Day Cocktail" },
  { name: "DAIQUIRI", ingredients: [{ name: "white rum", quantity: 4.5 }, { name: "lime juice", quantity: 2.5 }, { name: "simple syrup", quantity: 1.5 }], type: "Before Dinner Cocktail" },
  { name: "DERBY", ingredients: [{ name: "gin", quantity: 6.0 }, { name: "peach bitters", quantity: 0.12 }, { name: "mint", quantity: null }], type: "All Day Cocktail" },
  { name: "DRY MARTINI", ingredients: [{ name: "gin", quantity: 6.0 }, { name: "dry vermouth", quantity: 1.0 }], type: "Before Dinner Cocktail" },
  { name: "GIN FIZZ", ingredients: [{ name: "gin", quantity: 4.5 }, { name: "lemon juice", quantity: 3.0 }, { name: "sugar syrup", quantity: 1.0 }, { name: "soda water", quantity: 8.0 }], type: "Longdrink" },
  { name: "JOHN COLLINS", ingredients: [{ name: "gin", quantity: 4.5 }, { name: "lemon juice", quantity: 3.0 }, { name: "sugar syrup", quantity: 1.5 }, { name: "soda water", quantity: 6.0 }], type: "Longdrink" },
  { name: "MANHATTAN", ingredients: [{ name: "rye whiskey", quantity: 5.0 }, { name: "red vermouth", quantity: 2.0 }, { name: "angostura bitters", quantity: 0.06 }], type: "Before Dinner Cocktail" },
  { name: "MARY PICKFORD", ingredients: [{ name: "white rum", quantity: 6.0 }, { name: "maraschino", quantity: 1.0 }, { name: "pineapple juice", quantity: 6.0 }, { name: "grenadine syrup", quantity: 1.0 }], type: "All Day Cocktail" },
  { name: "MONKEY GLAND", ingredients: [{ name: "gin", quantity: 5.0 }, { name: "orange juice", quantity: 3.0 }, { name: "absinth", quantity: 0.12 }, { name: "grenadine", quantity: 0.12 }], type: "All Day Cocktail" },
  { name: "NEGRONI", ingredients: [{ name: "gin", quantity: 3.0 }, { name: "campari", quantity: 3.0 }, { name: "red vermouth", quantity: 3.0 }], type: "Before Dinner Cocktail" },
  { name: "OLD FASHIONED", ingredients: [{ name: "bourbon or rye whiskey", quantity: 4.5 }, { name: "angostura bitters", quantity: 0.12 }, { name: "simple syrup", quantity: 0.5 }], type: "Before Dinner Cocktail" },
  { name: "PARADISE", ingredients: [{ name: "gin", quantity: 3.5 }, { name: "apricot brandy", quantity: 2.0 }, { name: "orange juice", quantity: 1.5 }], type: "All Day Cocktail" },
  { name: "PLANTERS PUNCH", ingredients: [{ name: "dark rum", quantity: 4.5 }, { name: "orange juice", quantity: 3.5 }, { name: "pineapple juice", quantity: 3.5 }, { name: "lemon juice", quantity: 2.0 }, { name: "grenadine", quantity: 1.0 }, { name: "sugar syrup", quantity: 1.0 }, { name: "angostura bitters", quantity: 0.22 }], type: "Longdrink" },
  { name: "PORTO FLIP", ingredients: [{ name: "brandy", quantity: 1.5 }, { name: "red port", quantity: 4.5 }, { name: "egg yolk", quantity: 1.0 }], type: "After Dinner Cocktail" },
  { name: "RAMOS FIZZ", ingredients: [{ name: "gin", quantity: 4.5 }, { name: "lime juice", quantity: 1.5 }, { name: "lemon juice", quantity: 1.5 }, { name: "sugar syrup", quantity: 3.0 }, { name: "cream", quantity: 6.0 }, { name: "egg white", quantity: 0.5 }, { name: "orange flower water", quantity: 0.18 }, { name: "soda water", quantity: 3.0 }], type: "Longdrink" },
  { name: "RUSTY NAIL", ingredients: [{ name: "scotch whisky", quantity: 4.5 }, { name: "drambuie", quantity: 2.5 }], type: "After Dinner Cocktail" },
  { name: "SAZERAC", ingredients: [{ name: "cognac", quantity: 5.0 }, { name: "absinth", quantity: 1.0 }, { name: "simple syrup", quantity: 0.5 }, { name: "peychauds bitters", quantity: 0.12 }], type: "After Dinner Cocktail" },
  { name: "SCREWDRIVER", ingredients: [{ name: "vodka", quantity: 5.0 }, { name: "orange juice", quantity: 10.0 }], type: "All Day Cocktail" },
  { name: "SIDECAR", ingredients: [{ name: "cognac", quantity: 5.0 }, { name: "triple sec", quantity: 2.0 }, { name: "lemon juice", quantity: 2.0 }], type: "All Day Cocktail" },
  { name: "STINGER", ingredients: [{ name: "cognac", quantity: 5.0 }, { name: "creme de menthe", quantity: 2.0 }], type: "After Dinner Cocktail" },
  { name: "WHISKEY SOUR", ingredients: [{ name: "bourbon whiskey", quantity: 4.5 }, { name: "lemon juice", quantity: 3.0 }, { name: "sugar syrup", quantity: 1.5 }], type: "Before Dinner Cocktail" },
  { name: "WHITE LADY", ingredients: [{ name: "gin", quantity: 4.0 }, { name: "triple sec", quantity: 3.0 }, { name: "lemon juice", quantity: 2.0 }], type: "All Day Cocktail" },
  { name: "TUXEDO", ingredients: [{ name: "old tom gin", quantity: 3.0 }, { name: "dry vermouth", quantity: 3.0 }, { name: "maraschino", quantity: 0.25 }, { name: "absinth", quantity: 0.125 }, { name: "orange bitters", quantity: 0.18 }], type: "All Day Cocktail" },
  { name: "BELLINI", ingredients: [{ name: "prosecco", quantity: 10.0 }, { name: "peach puree", quantity: 5.0 }], type: "Sparkling Cocktail" },
  { name: "BLACK RUSSIAN", ingredients: [{ name: "vodka", quantity: 5.0 }, { name: "coffee liqueur", quantity: 2.0 }], type: "After Dinner Cocktail" },
  { name: "BLOODY MARY", ingredients: [{ name: "vodka", quantity: 4.5 }, { name: "tomato juice", quantity: 9.0 }, { name: "lemon juice", quantity: 1.5 }, { name: "worcestershire sauce", quantity: 0.15 }], type: "Longdrink" },
  { name: "CAIPIRINHA", ingredients: [{ name: "cachaca", quantity: 5.0 }, { name: "lime juice", quantity: 2.0 }, { name: "sugar", quantity: 1.0 }], type: "All Day Cocktail" },
  { name: "CHAMPAGNE COCKTAIL", ingredients: [{ name: "champagne", quantity: 9.0 }, { name: "cognac", quantity: 1.0 }, { name: "angostura bitters", quantity: 0.12 }, { name: "simple syrup", quantity: 0.5 }], type: "Sparkling Cocktail" },
  { name: "COSMOPOLITAN", ingredients: [{ name: "citron vodka", quantity: 4.0 }, { name: "cointreau", quantity: 1.5 }, { name: "lime juice", quantity: 1.5 }, { name: "cranberry juice", quantity: 3.0 }], type: "All Day Cocktail" },
  { name: "CUBA LIBRE", ingredients: [{ name: "white rum", quantity: 5.0 }, { name: "cola", quantity: 12.0 }, { name: "lime juice", quantity: 1.0 }], type: "Longdrink" },
  { name: "FRENCH CONNECTION", ingredients: [{ name: "cognac", quantity: 3.5 }, { name: "disaronno", quantity: 3.5 }], type: "After Dinner Cocktail" },
  { name: "GOD FATHER", ingredients: [{ name: "scotch", quantity: 3.5 }, { name: "disaronno", quantity: 3.5 }], type: "After Dinner Cocktail" },
  { name: "GOD MOTHER", ingredients: [{ name: "vodka", quantity: 3.5 }, { name: "disaronno", quantity: 3.5 }], type: "After Dinner Cocktail" },
  { name: "GOLDEN DREAM", ingredients: [{ name: "galliano", quantity: 2.0 }, { name: "triple sec", quantity: 2.0 }, { name: "orange juice", quantity: 2.0 }, { name: "cream", quantity: 1.0 }], type: "After Dinner Cocktail" },
  { name: "GRASSHOPPER", ingredients: [{ name: "creme de cacao", quantity: 3.0 }, { name: "creme de menthe", quantity: 3.0 }, { name: "cream", quantity: 3.0 }], type: "After Dinner Cocktail" },
  { name: "FRENCH 75", ingredients: [{ name: "gin", quantity: 3.0 }, { name: "lemon juice", quantity: 1.5 }, { name: "sugar syrup", quantity: 1.0 }, { name: "champagne", quantity: 6.0 }], type: "Sparkling Cocktail" },
  { name: "HARVEY WALLBANGER", ingredients: [{ name: "vodka", quantity: 4.5 }, { name: "galliano", quantity: 1.5 }, { name: "orange juice", quantity: 9.0 }], type: "All Day Cocktail" },
  { name: "HEMINGWAY SPECIAL", ingredients: [{ name: "white rum", quantity: 6.0 }, { name: "grapefruit juice", quantity: 4.0 }, { name: "maraschino", quantity: 1.5 }, { name: "lime juice", quantity: 1.5 }], type: "All Day Cocktail" },
  { name: "HORSES NECK", ingredients: [{ name: "brandy", quantity: 4.0 }, { name: "ginger ale", quantity: 12.0 }, { name: "angostura bitters", quantity: 0.06 }], type: "Longdrink" },
  { name: "IRISH COFFEE", ingredients: [{ name: "irish whiskey", quantity: 4.0 }, { name: "hot coffee", quantity: 9.0 }, { name: "cream", quantity: 3.0 }, { name: "brown sugar", quantity: 0.5 }], type: "Hot Drink" },
  { name: "KIR", ingredients: [{ name: "white wine", quantity: 9.0 }, { name: "creme de cassis", quantity: 1.0 }], type: "Before Dinner Cocktail" },
  { name: "LONG ISLAND ICED TEA", ingredients: [{ name: "tequila", quantity: 1.5 }, { name: "vodka", quantity: 1.5 }, { name: "white rum", quantity: 1.5 }, { name: "triple sec", quantity: 1.5 }, { name: "gin", quantity: 1.5 }, { name: "lemon juice", quantity: 2.5 }, { name: "simple syrup", quantity: 3.0 }, { name: "cola", quantity: 0.06 }], type: "Longdrink" },
  { name: "MAI TAI", ingredients: [{ name: "white rum", quantity: 4.0 }, { name: "dark rum", quantity: 2.0 }, { name: "orange curacao", quantity: 1.5 }, { name: "orgeat syrup", quantity: 1.5 }, { name: "lime juice", quantity: 1.0 }], type: "Longdrink" },
  { name: "MARGARITA", ingredients: [{ name: "tequila", quantity: 3.5 }, { name: "cointreau", quantity: 2.0 }, { name: "lime juice", quantity: 1.5 }], type: "All Day Cocktail" },
  { name: "MIMOSA", ingredients: [{ name: "champagne", quantity: 7.5 }, { name: "orange juice", quantity: 7.5 }], type: "Sparkling Cocktail" },
  { name: "MOJITO", ingredients: [{ name: "white rum", quantity: 4.0 }, { name: "lime juice", quantity: 3.0 }, { name: "mint", quantity: null }, { name: "sugar", quantity: 1.0 }, { name: "soda water", quantity: 6.0 }], type: "Longdrink" },
  { name: "MOSCOW MULE", ingredients: [{ name: "vodka", quantity: 4.5 }, { name: "ginger beer", quantity: 12.0 }, { name: "lime juice", quantity: 0.5 }], type: "Longdrink" },
  { name: "MINT JULEP", ingredients: [{ name: "bourbon whiskey", quantity: 6.0 }, { name: "mint", quantity: null }, { name: "sugar", quantity: 0.5 }, { name: "water", quantity: 1.0 }], type: "Longdrink" },
  { name: "PINA COLADA", ingredients: [{ name: "white rum", quantity: 3.0 }, { name: "pineapple juice", quantity: 9.0 }, { name: "coconut milk", quantity: 3.0 }], type: "Longdrink" },
  { name: "ROSE", ingredients: [{ name: "kirsch", quantity: 2.0 }, { name: "dry vermouth", quantity: 4.0 }, { name: "strawberry syrup", quantity: 0.18 }], type: "All Day Cocktail" },
  { name: "SEA BREEZE", ingredients: [{ name: "vodka", quantity: 4.0 }, { name: "cranberry juice", quantity: 12.0 }, { name: "grapefruit juice", quantity: 3.0 }], type: "Longdrink" },
  { name: "SEX ON THE BEACH", ingredients: [{ name: "vodka", quantity: 4.0 }, { name: "peach schnapps", quantity: 2.0 }, { name: "cranberry juice", quantity: 4.0 }, { name: "orange juice", quantity: 4.0 }], type: "Longdrink" },
  { name: "SINGAPORE SLING", ingredients: [{ name: "gin", quantity: 3.0 }, { name: "cherry liqueur", quantity: 1.5 }, { name: "cointreau", quantity: 0.75 }, { name: "dom benedictine", quantity: 0.75 }, { name: "pineapple juice", quantity: 12.0 }, { name: "lime juice", quantity: 1.5 }, { name: "grenadine", quantity: 1.0 }, { name: "angostura bitters", quantity: 0.06 }], type: "Longdrink" },
  { name: "TEQUILA SUNRISE", ingredients: [{ name: "tequila", quantity: 4.5 }, { name: "orange juice", quantity: 9.0 }, { name: "grenadine", quantity: 1.5 }], type: "Longdrink" },
  { name: "BARRACUDA", ingredients: [{ name: "gold rum", quantity: 4.5 }, { name: "galliano", quantity: 1.5 }, { name: "pineapple juice", quantity: 6.0 }, { name: "lime juice", quantity: 0.06 }, { name: "prosecco", quantity: 2.96 }], type: "Sparkling Cocktail" },
  { name: "BRAMBLE", ingredients: [{ name: "gin", quantity: 4.0 }, { name: "lemon juice", quantity: 1.5 }, { name: "sugar syrup", quantity: 1.0 }, { name: "blackberry liqueur", quantity: 1.5 }], type: "All Day Cocktail" },
  { name: "B52", ingredients: [{ name: "kahlua", quantity: 2.0 }, { name: "baileys irish cream", quantity: 2.0 }, { name: "grand marnier", quantity: 2.0 }], type: "After Dinner Cocktail" },
  { name: "DARK N STORMY", ingredients: [{ name: "dark rum", quantity: 6.0 }, { name: "ginger beer", quantity: 10.0 }], type: "Longdrink" },
  { name: "DIRTY MARTINI", ingredients: [{ name: "vodka", quantity: 6.0 }, { name: "dry vermouth", quantity: 1.0 }, { name: "olive juice", quantity: 1.0 }], type: "Before Dinner Cocktail" },
  { name: "ESPRESSO MARTINI", ingredients: [{ name: "vodka", quantity: 5.0 }, { name: "kahlua", quantity: 1.0 }, { name: "simple syrup", quantity: 0.5 }, { name: "espresso", quantity: 2.96 }], type: "After Dinner Cocktail" },
  { name: "FRENCH MARTINI", ingredients: [{ name: "vodka", quantity: 4.5 }, { name: "raspberry liqueur", quantity: 1.5 }, { name: "pineapple juice", quantity: 1.5 }], type: "Before Dinner Cocktail" },
  { name: "KAMIKAZE", ingredients: [{ name: "vodka", quantity: 3.0 }, { name: "triple sec", quantity: 3.0 }, { name: "lime juice", quantity: 3.0 }], type: "All Day Cocktail" },
  { name: "LEMON DROP MARTINI", ingredients: [{ name: "citron vodka", quantity: 2.5 }, { name: "triple sec", quantity: 2.0 }, { name: "lemon juice", quantity: 1.5 }], type: "All Day Cocktail" },
  { name: "PISCO SOUR", ingredients: [{ name: "pisco", quantity: 4.5 }, { name: "lemon juice", quantity: 3.0 }, { name: "sugar syrup", quantity: 2.0 }, { name: "egg white", quantity: 0.5 }], type: "All Day Cocktail" },
  { name: "RUSSIAN SPRING PUNCH", ingredients: [{ name: "vodka", quantity: 2.5 }, { name: "lemon juice", quantity: 2.5 }, { name: "creme de cassis", quantity: 1.5 }, { name: "sugar syrup", quantity: 1.0 }], type: "Sparkling Cocktail" },
  { name: "SPRITZ VENEZIANO", ingredients: [{ name: "prosecco", quantity: 6.0 }, { name: "aperol", quantity: 4.0 }, { name: "soda water", quantity: 0.74 }], type: "Sparkling Cocktail" },
  { name: "TOMMYS MARGARITA", ingredients: [{ name: "tequila", quantity: 4.5 }, { name: "lime juice", quantity: 1.5 }, { name: "agave nectar", quantity: 1.0 }], type: "All Day Cocktail" },
  { name: "VAMPIRO", ingredients: [{ name: "tequila", quantity: 5.0 }, { name: "tomato juice", quantity: 7.0 }, { name: "orange juice", quantity: 3.0 }, { name: "lime juice", quantity: 1.0 }, { name: "honey", quantity: 0.5 }], type: "All Day Cocktail" },
  { name: "VESPER", ingredients: [{ name: "gin", quantity: 6.0 }, { name: "vodka", quantity: 1.5 }, { name: "lillet blonde", quantity: 0.75 }], type: "Before Dinner Cocktail" },
  { name: "YELLOW BIRD", ingredients: [{ name: "white rum", quantity: 3.0 }, { name: "galliano", quantity: 1.5 }, { name: "triple sec", quantity: 1.5 }, { name: "lime juice", quantity: 1.5 }], type: "All Day Cocktail" },
  // IBA 2020 additions
  { name: "ZOMBIE", ingredients: [{ name: "white rum", quantity: 4.0 }, { name: "gold rum", quantity: 3.0 }, { name: "dark rum", quantity: 1.5 }, { name: "apricot brandy", quantity: 1.5 }, { name: "pineapple juice", quantity: 6.0 }, { name: "lime juice", quantity: 1.5 }, { name: "grenadine", quantity: 0.75 }, { name: "angostura bitters", quantity: 0.12 }], type: "Longdrink" },
  { name: "CORPSE REVIVER", ingredients: [{ name: "gin", quantity: 3.0 }, { name: "cointreau", quantity: 3.0 }, { name: "lillet blonde", quantity: 3.0 }, { name: "lemon juice", quantity: 3.0 }, { name: "absinth", quantity: 0.12 }], type: "All Day Cocktail" },
];

// ─── Ingredient profiles ───────────────────────────────────────────────────────
// abv=%, sw/so/bi/fr = 0~1 flavor intensity contribution
type Profile = { abv: number; sw: number; so: number; bi: number; fr: number; cat: string };
const P: Record<string, Profile> = {
  // Spirits
  "gin":                   { abv: 40, sw: 0.05, so: 0.05, bi: 0.15, fr: 0.25, cat: "베이스" },
  "old tom gin":           { abv: 40, sw: 0.15, so: 0.05, bi: 0.15, fr: 0.20, cat: "베이스" },
  "vodka":                 { abv: 40, sw: 0.00, so: 0.00, bi: 0.05, fr: 0.05, cat: "베이스" },
  "citron vodka":          { abv: 40, sw: 0.10, so: 0.20, bi: 0.05, fr: 0.25, cat: "베이스" },
  "white rum":             { abv: 40, sw: 0.15, so: 0.00, bi: 0.05, fr: 0.10, cat: "베이스" },
  "dark rum":              { abv: 40, sw: 0.30, so: 0.00, bi: 0.10, fr: 0.05, cat: "베이스" },
  "gold rum":              { abv: 40, sw: 0.25, so: 0.00, bi: 0.08, fr: 0.07, cat: "베이스" },
  "tequila":               { abv: 40, sw: 0.08, so: 0.05, bi: 0.20, fr: 0.20, cat: "베이스" },
  "cognac":                { abv: 40, sw: 0.20, so: 0.10, bi: 0.20, fr: 0.10, cat: "베이스" },
  "brandy":                { abv: 40, sw: 0.20, so: 0.10, bi: 0.20, fr: 0.10, cat: "베이스" },
  "rye whiskey":           { abv: 45, sw: 0.12, so: 0.05, bi: 0.30, fr: 0.08, cat: "베이스" },
  "bourbon whiskey":       { abv: 43, sw: 0.28, so: 0.05, bi: 0.25, fr: 0.08, cat: "베이스" },
  "bourbon or rye whiskey":{ abv: 43, sw: 0.22, so: 0.05, bi: 0.28, fr: 0.08, cat: "베이스" },
  "scotch whisky":         { abv: 43, sw: 0.12, so: 0.05, bi: 0.35, fr: 0.10, cat: "베이스" },
  "scotch":                { abv: 43, sw: 0.12, so: 0.05, bi: 0.35, fr: 0.10, cat: "베이스" },
  "irish whiskey":         { abv: 40, sw: 0.20, so: 0.05, bi: 0.18, fr: 0.10, cat: "베이스" },
  "calvados":              { abv: 40, sw: 0.30, so: 0.15, bi: 0.18, fr: 0.15, cat: "베이스" },
  "cachaca":               { abv: 40, sw: 0.15, so: 0.00, bi: 0.08, fr: 0.18, cat: "베이스" },
  "pisco":                 { abv: 40, sw: 0.10, so: 0.00, bi: 0.10, fr: 0.15, cat: "베이스" },
  "kirsch":                { abv: 40, sw: 0.20, so: 0.05, bi: 0.10, fr: 0.10, cat: "베이스" },
  "absinth":               { abv: 70, sw: 0.10, so: 0.10, bi: 0.50, fr: 0.30, cat: "베이스" },
  // Liqueurs
  "campari":               { abv: 24, sw: 0.30, so: 0.05, bi: 0.85, fr: 0.20, cat: "리큐어" },
  "aperol":                { abv: 11, sw: 0.40, so: 0.05, bi: 0.65, fr: 0.30, cat: "리큐어" },
  "dry vermouth":          { abv: 18, sw: 0.10, so: 0.10, bi: 0.35, fr: 0.20, cat: "리큐어" },
  "red vermouth":          { abv: 18, sw: 0.40, so: 0.05, bi: 0.28, fr: 0.10, cat: "리큐어" },
  "maraschino":            { abv: 32, sw: 0.60, so: 0.10, bi: 0.10, fr: 0.20, cat: "리큐어" },
  "triple sec":            { abv: 40, sw: 0.50, so: 0.20, bi: 0.05, fr: 0.30, cat: "리큐어" },
  "cointreau":             { abv: 40, sw: 0.50, so: 0.20, bi: 0.05, fr: 0.30, cat: "리큐어" },
  "creme de cacao":        { abv: 25, sw: 0.80, so: 0.00, bi: 0.28, fr: 0.00, cat: "리큐어" },
  "creme de menthe":       { abv: 25, sw: 0.70, so: 0.00, bi: 0.00, fr: 0.70, cat: "리큐어" },
  "creme de cassis":       { abv: 20, sw: 0.70, so: 0.20, bi: 0.10, fr: 0.10, cat: "리큐어" },
  "coffee liqueur":        { abv: 20, sw: 0.70, so: 0.00, bi: 0.40, fr: 0.00, cat: "리큐어" },
  "kahlua":                { abv: 20, sw: 0.70, so: 0.00, bi: 0.40, fr: 0.00, cat: "리큐어" },
  "galliano":              { abv: 42, sw: 0.60, so: 0.00, bi: 0.10, fr: 0.30, cat: "리큐어" },
  "drambuie":              { abv: 40, sw: 0.60, so: 0.05, bi: 0.15, fr: 0.20, cat: "리큐어" },
  "disaronno":             { abv: 28, sw: 0.70, so: 0.00, bi: 0.05, fr: 0.10, cat: "리큐어" },
  "baileys irish cream":   { abv: 17, sw: 0.70, so: 0.00, bi: 0.15, fr: 0.05, cat: "리큐어" },
  "grand marnier":         { abv: 40, sw: 0.50, so: 0.15, bi: 0.10, fr: 0.30, cat: "리큐어" },
  "raspberry liqueur":     { abv: 20, sw: 0.65, so: 0.28, bi: 0.05, fr: 0.20, cat: "리큐어" },
  "blackberry liqueur":    { abv: 20, sw: 0.65, so: 0.20, bi: 0.10, fr: 0.10, cat: "리큐어" },
  "cherry liqueur":        { abv: 25, sw: 0.65, so: 0.10, bi: 0.05, fr: 0.10, cat: "리큐어" },
  "peach schnapps":        { abv: 20, sw: 0.70, so: 0.05, bi: 0.05, fr: 0.20, cat: "리큐어" },
  "orange curacao":        { abv: 40, sw: 0.50, so: 0.20, bi: 0.05, fr: 0.30, cat: "리큐어" },
  "lillet blonde":         { abv: 17, sw: 0.30, so: 0.10, bi: 0.20, fr: 0.20, cat: "리큐어" },
  "dom benedictine":       { abv: 40, sw: 0.50, so: 0.05, bi: 0.20, fr: 0.20, cat: "리큐어" },
  "apricot brandy":        { abv: 30, sw: 0.60, so: 0.10, bi: 0.05, fr: 0.20, cat: "리큐어" },
  "raspberry syrup":       { abv:  0, sw: 0.75, so: 0.25, bi: 0.00, fr: 0.10, cat: "시럽" },
  "strawberry syrup":      { abv:  0, sw: 0.80, so: 0.15, bi: 0.00, fr: 0.10, cat: "시럽" },
  // Wine & Sparkling
  "prosecco":              { abv: 12, sw: 0.20, so: 0.20, bi: 0.05, fr: 0.60, cat: "와인" },
  "champagne":             { abv: 12, sw: 0.20, so: 0.20, bi: 0.05, fr: 0.65, cat: "와인" },
  "white wine":            { abv: 12, sw: 0.15, so: 0.25, bi: 0.10, fr: 0.40, cat: "와인" },
  "red port":              { abv: 20, sw: 0.50, so: 0.10, bi: 0.20, fr: 0.05, cat: "와인" },
  // Bitters
  "angostura bitters":     { abv: 44, sw: 0.10, so: 0.00, bi: 0.90, fr: 0.20, cat: "비터스" },
  "peychauds bitters":     { abv: 35, sw: 0.20, so: 0.00, bi: 0.80, fr: 0.20, cat: "비터스" },
  "orange bitters":        { abv: 28, sw: 0.10, so: 0.10, bi: 0.80, fr: 0.30, cat: "비터스" },
  "peach bitters":         { abv: 35, sw: 0.20, so: 0.10, bi: 0.70, fr: 0.20, cat: "비터스" },
  // Juices
  "lemon juice":           { abv:  0, sw: 0.08, so: 0.90, bi: 0.05, fr: 0.60, cat: "주스" },
  "lime juice":            { abv:  0, sw: 0.05, so: 0.90, bi: 0.05, fr: 0.70, cat: "주스" },
  "orange juice":          { abv:  0, sw: 0.50, so: 0.30, bi: 0.05, fr: 0.50, cat: "주스" },
  "pineapple juice":       { abv:  0, sw: 0.55, so: 0.20, bi: 0.00, fr: 0.50, cat: "주스" },
  "cranberry juice":       { abv:  0, sw: 0.30, so: 0.40, bi: 0.10, fr: 0.20, cat: "주스" },
  "grapefruit juice":      { abv:  0, sw: 0.20, so: 0.50, bi: 0.30, fr: 0.50, cat: "주스" },
  "tomato juice":          { abv:  0, sw: 0.15, so: 0.20, bi: 0.10, fr: 0.10, cat: "주스" },
  "olive juice":           { abv:  0, sw: 0.00, so: 0.20, bi: 0.30, fr: 0.00, cat: "주스" },
  "peach puree":           { abv:  0, sw: 0.70, so: 0.10, bi: 0.00, fr: 0.20, cat: "주스" },
  // Mixers
  "soda water":            { abv:  0, sw: 0.00, so: 0.05, bi: 0.00, fr: 0.50, cat: "믹서" },
  "cola":                  { abv:  0, sw: 0.50, so: 0.20, bi: 0.20, fr: 0.20, cat: "믹서" },
  "ginger beer":           { abv:  0, sw: 0.20, so: 0.10, bi: 0.10, fr: 0.70, cat: "믹서" },
  "ginger ale":            { abv:  0, sw: 0.30, so: 0.10, bi: 0.05, fr: 0.60, cat: "믹서" },
  "hot coffee":            { abv:  0, sw: 0.05, so: 0.10, bi: 0.50, fr: 0.00, cat: "믹서" },
  "espresso":              { abv:  0, sw: 0.05, so: 0.10, bi: 0.80, fr: 0.00, cat: "믹서" },
  "coconut milk":          { abv:  0, sw: 0.50, so: 0.00, bi: 0.00, fr: 0.20, cat: "믹서" },
  // Syrups & Sweeteners
  "simple syrup":          { abv:  0, sw: 0.90, so: 0.00, bi: 0.00, fr: 0.00, cat: "시럽" },
  "sugar syrup":           { abv:  0, sw: 0.90, so: 0.00, bi: 0.00, fr: 0.00, cat: "시럽" },
  "simple syrup ":         { abv:  0, sw: 0.90, so: 0.00, bi: 0.00, fr: 0.00, cat: "시럽" },
  "grenadine":             { abv:  0, sw: 0.85, so: 0.10, bi: 0.00, fr: 0.00, cat: "시럽" },
  "grenadine syrup":       { abv:  0, sw: 0.85, so: 0.10, bi: 0.00, fr: 0.00, cat: "시럽" },
  "orgeat syrup":          { abv:  0, sw: 0.80, so: 0.00, bi: 0.00, fr: 0.10, cat: "시럽" },
  "agave nectar":          { abv:  0, sw: 0.85, so: 0.00, bi: 0.00, fr: 0.10, cat: "시럽" },
  "honey":                 { abv:  0, sw: 0.85, so: 0.00, bi: 0.00, fr: 0.10, cat: "시럽" },
  "sugar":                 { abv:  0, sw: 0.90, so: 0.00, bi: 0.00, fr: 0.00, cat: "설탕" },
  "brown sugar":           { abv:  0, sw: 0.85, so: 0.00, bi: 0.05, fr: 0.00, cat: "설탕" },
  // Dairy / Other
  "cream":                 { abv:  0, sw: 0.30, so: 0.00, bi: 0.00, fr: 0.05, cat: "기타" },
  "egg white":             { abv:  0, sw: 0.00, so: 0.00, bi: 0.00, fr: 0.08, cat: "기타" },
  "egg yolk":              { abv:  0, sw: 0.10, so: 0.00, bi: 0.10, fr: 0.00, cat: "기타" },
  "water":                 { abv:  0, sw: 0.00, so: 0.00, bi: 0.00, fr: 0.05, cat: "기타" },
  "mint":                  { abv:  0, sw: 0.05, so: 0.00, bi: 0.00, fr: 0.90, cat: "가니쉬" },
  "worcestershire sauce":  { abv:  0, sw: 0.05, so: 0.15, bi: 0.35, fr: 0.00, cat: "기타" },
  "orange flower water":   { abv:  0, sw: 0.10, so: 0.00, bi: 0.00, fr: 0.40, cat: "기타" },
};

// Korean display names
const KO_NAME: Record<string, string> = {
  "ALEXANDER": "알렉산더", "AMERICANO": "아메리카노", "ANGEL FACE": "엔젤 페이스",
  "AVIATION": "에이비에이션", "BACARDI": "바카디", "BETWEEN THE SHEETS": "비트윈 더 시트",
  "CASINO": "카지노", "CLOVER CLUB": "클로버 클럽", "DAIQUIRI": "다이키리",
  "DERBY": "더비", "DRY MARTINI": "드라이 마티니", "GIN FIZZ": "진 피즈",
  "JOHN COLLINS": "존 콜린스", "MANHATTAN": "맨해튼", "MARY PICKFORD": "메리 픽포드",
  "MONKEY GLAND": "몽키 글랜드", "NEGRONI": "네그로니", "OLD FASHIONED": "올드 패션드",
  "PARADISE": "파라다이스", "PLANTERS PUNCH": "플랜터스 펀치", "PORTO FLIP": "포르토 플립",
  "RAMOS FIZZ": "라모스 피즈", "RUSTY NAIL": "러스티 네일", "SAZERAC": "사제락",
  "SCREWDRIVER": "스크류드라이버", "SIDECAR": "사이드카", "STINGER": "스팅어",
  "WHISKEY SOUR": "위스키 사워", "WHITE LADY": "화이트 레이디", "TUXEDO": "턱시도",
  "BELLINI": "벨리니", "BLACK RUSSIAN": "블랙 러시안", "BLOODY MARY": "블러디 메리",
  "CAIPIRINHA": "카이피리냐", "CHAMPAGNE COCKTAIL": "샴페인 칵테일", "COSMOPOLITAN": "코스모폴리탄",
  "CUBA LIBRE": "쿠바 리브레", "FRENCH CONNECTION": "프렌치 커넥션", "GOD FATHER": "갓파더",
  "GOD MOTHER": "갓마더", "GOLDEN DREAM": "골든 드림", "GRASSHOPPER": "그래스호퍼",
  "FRENCH 75": "프렌치 75", "HARVEY WALLBANGER": "하비 월뱅어", "HEMINGWAY SPECIAL": "헤밍웨이 스페셜",
  "HORSES NECK": "호스 넥", "IRISH COFFEE": "아이리시 커피", "KIR": "키르",
  "LONG ISLAND ICED TEA": "롱아일랜드 아이스티", "MAI TAI": "마이타이", "MARGARITA": "마르가리타",
  "MIMOSA": "미모사", "MOJITO": "모히토", "MOSCOW MULE": "모스코 뮬",
  "MINT JULEP": "민트 줄렙", "PINA COLADA": "피나 콜라다", "ROSE": "로제",
  "SEA BREEZE": "씨 브리즈", "SEX ON THE BEACH": "섹스 온 더 비치", "SINGAPORE SLING": "싱가포르 슬링",
  "TEQUILA SUNRISE": "테킬라 선라이즈", "BARRACUDA": "바라쿠다", "BRAMBLE": "브램블",
  "B52": "비-52", "DARK N STORMY": "다크 앤 스토미", "DIRTY MARTINI": "더티 마티니",
  "ESPRESSO MARTINI": "에스프레소 마티니", "FRENCH MARTINI": "프렌치 마티니", "KAMIKAZE": "카미카제",
  "LEMON DROP MARTINI": "레몬 드롭 마티니", "PISCO SOUR": "피스코 사워",
  "RUSSIAN SPRING PUNCH": "러시안 스프링 펀치", "SPRITZ VENEZIANO": "스프리츠 베네치아노",
  "TOMMYS MARGARITA": "토미스 마르가리타", "VAMPIRO": "밤피로", "VESPER": "베스퍼",
  "YELLOW BIRD": "옐로우 버드",
  "ZOMBIE": "좀비", "CORPSE REVIVER": "콥스 리바이버 #2",
};

const GLASS_MAP: Record<string, string> = {
  "ALEXANDER": "coupe", "AMERICANO": "rocks", "ANGEL FACE": "coupe",
  "AVIATION": "coupe", "BACARDI": "coupe", "BETWEEN THE SHEETS": "coupe",
  "CASINO": "coupe", "CLOVER CLUB": "coupe", "DAIQUIRI": "coupe",
  "DERBY": "coupe", "DRY MARTINI": "martini", "GIN FIZZ": "highball",
  "JOHN COLLINS": "highball", "MANHATTAN": "coupe", "MARY PICKFORD": "coupe",
  "MONKEY GLAND": "coupe", "NEGRONI": "rocks", "OLD FASHIONED": "rocks",
  "PARADISE": "coupe", "PLANTERS PUNCH": "highball", "PORTO FLIP": "coupe",
  "RAMOS FIZZ": "highball", "RUSTY NAIL": "rocks", "SAZERAC": "rocks",
  "SCREWDRIVER": "highball", "SIDECAR": "coupe", "STINGER": "coupe",
  "WHISKEY SOUR": "rocks", "WHITE LADY": "coupe", "TUXEDO": "coupe",
  "BELLINI": "flute", "BLACK RUSSIAN": "rocks", "BLOODY MARY": "highball",
  "CAIPIRINHA": "rocks", "CHAMPAGNE COCKTAIL": "flute", "COSMOPOLITAN": "martini",
  "CUBA LIBRE": "highball", "FRENCH CONNECTION": "rocks", "GOD FATHER": "rocks",
  "GOD MOTHER": "rocks", "GOLDEN DREAM": "coupe", "GRASSHOPPER": "coupe",
  "FRENCH 75": "flute", "HARVEY WALLBANGER": "highball", "HEMINGWAY SPECIAL": "coupe",
  "HORSES NECK": "highball", "IRISH COFFEE": "highball", "KIR": "flute",
  "LONG ISLAND ICED TEA": "highball", "MAI TAI": "highball", "MARGARITA": "coupe",
  "MIMOSA": "flute", "MOJITO": "highball", "MOSCOW MULE": "highball",
  "MINT JULEP": "highball", "PINA COLADA": "highball", "ROSE": "coupe",
  "SEA BREEZE": "highball", "SEX ON THE BEACH": "highball", "SINGAPORE SLING": "highball",
  "TEQUILA SUNRISE": "highball", "BARRACUDA": "flute", "BRAMBLE": "rocks",
  "B52": "coupe", "DARK N STORMY": "highball", "DIRTY MARTINI": "martini",
  "ESPRESSO MARTINI": "martini", "FRENCH MARTINI": "martini", "KAMIKAZE": "coupe",
  "LEMON DROP MARTINI": "martini", "PISCO SOUR": "coupe", "RUSSIAN SPRING PUNCH": "flute",
  "SPRITZ VENEZIANO": "rocks", "TOMMYS MARGARITA": "coupe", "VAMPIRO": "highball",
  "VESPER": "martini", "YELLOW BIRD": "coupe",
  "ZOMBIE": "highball", "CORPSE REVIVER": "coupe",
};

const METHOD_MAP: Record<string, string> = {
  "DRY MARTINI": "stirring", "DIRTY MARTINI": "stirring", "VESPER": "stirring",
  "NEGRONI": "stirring", "MANHATTAN": "stirring", "SAZERAC": "stirring",
  "STINGER": "stirring", "TUXEDO": "stirring", "ROSE": "stirring",
  "RUSTY NAIL": "build", "AMERICANO": "build", "BLACK RUSSIAN": "build",
  "GOD FATHER": "build", "GOD MOTHER": "build", "FRENCH CONNECTION": "build",
  "OLD FASHIONED": "build", "CUBA LIBRE": "build", "MOJITO": "build",
  "CAIPIRINHA": "build", "MOSCOW MULE": "build", "DARK N STORMY": "build",
  "TEQUILA SUNRISE": "build", "SEX ON THE BEACH": "build", "SEA BREEZE": "build",
  "SCREWDRIVER": "build", "BLOODY MARY": "build", "HARVEY WALLBANGER": "build",
  "HORSES NECK": "build", "MINT JULEP": "build", "BELLINI": "build",
  "MIMOSA": "build", "KIR": "build", "CHAMPAGNE COCKTAIL": "build",
  "RUSSIAN SPRING PUNCH": "build", "SPRITZ VENEZIANO": "build",
  "IRISH COFFEE": "build", "VAMPIRO": "build", "B52": "build",
  "PINA COLADA": "blending",
};

const POPULARITY_MAP: Record<string, number> = {
  "MOJITO": 0.95, "MARGARITA": 0.93, "OLD FASHIONED": 0.92, "NEGRONI": 0.90,
  "DAIQUIRI": 0.88, "DRY MARTINI": 0.88, "COSMOPOLITAN": 0.85, "ESPRESSO MARTINI": 0.82,
  "WHISKEY SOUR": 0.82, "MOSCOW MULE": 0.81, "PINA COLADA": 0.83, "MIMOSA": 0.80,
  "BLOODY MARY": 0.79, "MANHATTAN": 0.87, "LONG ISLAND ICED TEA": 0.76,
  "CUBA LIBRE": 0.75, "SPRITZ VENEZIANO": 0.75, "SEX ON THE BEACH": 0.74,
  "MAI TAI": 0.74, "FRENCH 75": 0.73, "CAIPIRINHA": 0.76,
  "CHAMPAGNE COCKTAIL": 0.72, "SCREWDRIVER": 0.72, "DIRTY MARTINI": 0.72,
  "SINGAPORE SLING": 0.70, "SAZERAC": 0.71, "MINT JULEP": 0.70,
  "BELLINI": 0.78, "IRISH COFFEE": 0.78, "DARK N STORMY": 0.72,
  "TEQUILA SUNRISE": 0.77, "LEMON DROP MARTINI": 0.68, "PISCO SOUR": 0.68,
  "AVIATION": 0.68, "FRENCH MARTINI": 0.68, "AMERICANO": 0.68, "GIN FIZZ": 0.68,
  "KIR": 0.65, "JOHN COLLINS": 0.65, "KAMIKAZE": 0.65, "BACARDI": 0.65,
  "RUSTY NAIL": 0.65, "B52": 0.65, "SEA BREEZE": 0.67,
  "SIDECAR": 0.67, "TOMMYS MARGARITA": 0.67, "HEMINGWAY SPECIAL": 0.65,
  "BRAMBLE": 0.65, "GOD FATHER": 0.65, "VESPER": 0.68,
  "BLACK RUSSIAN": 0.68, "FRENCH CONNECTION": 0.63, "HORSES NECK": 0.63,
  "GOD MOTHER": 0.62, "WHITE LADY": 0.62, "CLOVER CLUB": 0.62,
  "PLANTERS PUNCH": 0.62, "HARVEY WALLBANGER": 0.58, "BETWEEN THE SHEETS": 0.60,
  "ALEXANDER": 0.60, "GRASSHOPPER": 0.60, "YELLOW BIRD": 0.60,
  "MARY PICKFORD": 0.58, "BARRACUDA": 0.60, "RAMOS FIZZ": 0.60,
  "MONKEY GLAND": 0.58, "RUSSIAN SPRING PUNCH": 0.58, "GOLDEN DREAM": 0.55,
  "PORTO FLIP": 0.55, "TUXEDO": 0.55, "CASINO": 0.55,
  "ZOMBIE": 0.72, "CORPSE REVIVER": 0.68,
  "ANGEL FACE": 0.55, "PARADISE": 0.55, "ROSE": 0.50,
  "VAMPIRO": 0.55, "DERBY": 0.52, "STINGER": 0.60,
};

// ─── Helper functions ──────────────────────────────────────────────────────────
function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/,$/, "").trim();
}

function lookupProfile(rawName: string): Profile | null {
  const n = normalize(rawName);
  return P[n] ?? null;
}

// 맛 벡터는 결정론적 flavorModel 로 계산 (재료 이름은 한국어 DB 표기로 변환, cl → ml)
function computeProfile(ings: { name: string; quantity: number | null }[], method: string) {
  const r = computeFlavor(
    ings.map((i) => ({ name: ING_KO[normalize(i.name)] ?? i.name, ml: i.quantity != null ? i.quantity * 10 : 0 })),
    mapDbMethod(method),
  );
  if (r.unknown.length > 0) console.warn(`  ⚠ flavorModel unknown ingredients: ${r.unknown.join(", ")}`);
  return { abv: r.abv, sweetness: r.sweetness, sourness: r.sourness, bitterness: r.bitterness, freshness: r.freshness, strength: r.strength };
}

function mapCategory(type: string | null): string {
  if (!type) return "All Day Cocktail";
  const t = type.trim().toLowerCase();
  if (t.includes("before dinner")) return "Before Dinner Cocktail";
  if (t.includes("after dinner")) return "After Dinner Cocktail";
  if (t.includes("longdrink") || t.includes("long drink")) return "Longdrink";
  if (t.includes("sparkling")) return "Sparkling Cocktail";
  if (t.includes("hot")) return "Hot Drink";
  return "All Day Cocktail";
}

// ─── Ingredient English → Korean name ─────────────────────────────────────────
const ING_KO: Record<string, string> = {
  "gin": "진", "old tom gin": "올드 톰 진", "vodka": "보드카", "citron vodka": "시트론 보드카",
  "white rum": "화이트 럼", "dark rum": "다크 럼", "gold rum": "골드 럼",
  "tequila": "데킬라", "cognac": "코냑", "brandy": "브랜디",
  "rye whiskey": "라이 위스키", "bourbon whiskey": "버번 위스키",
  "bourbon or rye whiskey": "버번/라이 위스키", "scotch whisky": "스카치 위스키",
  "scotch": "스카치", "irish whiskey": "아이리시 위스키", "calvados": "칼바도스",
  "cachaca": "카샤사", "pisco": "피스코", "kirsch": "키르쉬",
  "absinth": "압생트", "campari": "캄파리", "aperol": "아페롤",
  "dry vermouth": "드라이 베르무트", "red vermouth": "레드 베르무트",
  "maraschino": "마라스키노", "triple sec": "트리플 섹", "cointreau": "코앵트로",
  "creme de cacao": "크렘 드 카카오", "creme de menthe": "크렘 드 민트",
  "creme de cassis": "크렘 드 카시스", "coffee liqueur": "커피 리큐어",
  "kahlua": "칼루아", "galliano": "갈리아노", "drambuie": "드람부이",
  "disaronno": "디사론노", "baileys irish cream": "베일리스",
  "grand marnier": "그랑 마르니에", "raspberry liqueur": "라즈베리 리큐어",
  "blackberry liqueur": "블랙베리 리큐어", "cherry liqueur": "체리 리큐어",
  "peach schnapps": "피치 슈납스", "orange curacao": "오렌지 큐라소",
  "lillet blonde": "릴렛 블랑", "dom benedictine": "베네딕틴",
  "apricot brandy": "애프리콧 브랜디", "raspberry syrup": "라즈베리 시럽",
  "strawberry syrup": "딸기 시럽", "prosecco": "프로세코", "champagne": "샴페인",
  "white wine": "화이트 와인", "red port": "레드 포트",
  "angostura bitters": "앙고스투라 비터스", "peychauds bitters": "페이쇼 비터스",
  "orange bitters": "오렌지 비터스", "peach bitters": "피치 비터스",
  "lemon juice": "레몬 주스", "lime juice": "라임 주스", "orange juice": "오렌지 주스",
  "pineapple juice": "파인애플 주스", "cranberry juice": "크랜베리 주스",
  "grapefruit juice": "그레이프프루트 주스", "tomato juice": "토마토 주스",
  "olive juice": "올리브 주스", "peach puree": "피치 퓨레",
  "soda water": "소다수", "cola": "콜라", "ginger beer": "진저비어",
  "ginger ale": "진저에일", "hot coffee": "핫 커피", "espresso": "에스프레소",
  "coconut milk": "코코넛 밀크", "simple syrup": "심플 시럽", "sugar syrup": "슈거 시럽",
  "grenadine": "그레나딘", "grenadine syrup": "그레나딘 시럽",
  "orgeat syrup": "오르자 시럽", "agave nectar": "아가베 넥타",
  "honey": "꿀", "sugar": "설탕", "brown sugar": "브라운 슈가",
  "cream": "크림", "egg white": "달걀 흰자", "egg yolk": "달걀 노른자",
  "water": "물", "mint": "민트", "worcestershire sauce": "우스터 소스",
  "orange flower water": "오렌지 플라워 워터",
};

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seeding IBA cocktails (86 recipes)...");

  // 1. Clear existing data
  await prisma.cocktailIngredient.deleteMany();
  await prisma.cocktail.deleteMany();
  await prisma.ingredient.deleteMany();

  // 2. Collect unique ingredient names from all cocktails
  const ingredientNames = new Set<string>();
  for (const c of IBA_DATA) {
    for (const ing of c.ingredients) {
      const n = normalize(ing.name);
      if (lookupProfile(ing.name)) ingredientNames.add(n);
    }
  }

  // 3. Create ingredients
  const ingredientIdMap = new Map<string, string>();
  for (const n of ingredientNames) {
    const p = P[n]!;
    const created = await prisma.ingredient.create({
      data: {
        name:   ING_KO[n] ?? n,
        nameEn: n.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        category: p.cat,
        abv: p.abv,
      },
    });
    ingredientIdMap.set(n, created.id);
  }
  console.log(`✅ Created ${ingredientNames.size} ingredients`);

  // 4. Create cocktails + join records
  let cocktailCount = 0;
  for (const c of IBA_DATA) {
    const koName = KO_NAME[c.name] ?? c.name;
    const glass  = GLASS_MAP[c.name]  ?? "coupe";
    const method = METHOD_MAP[c.name] ?? "shaking";
    const profile = computeProfile(c.ingredients, method);
    const pop    = POPULARITY_MAP[c.name] ?? 0.60;

    const cocktail = await prisma.cocktail.create({
      data: {
        name:       koName,
        nameEn:     c.name.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
        description: `${mapCategory(c.type)} — IBA 공식 레시피`,
        category:   mapCategory(c.type),
        glassType:  glass,
        method,
        sweetness:  profile.sweetness,
        sourness:   profile.sourness,
        bitterness: profile.bitterness,
        strength:   profile.strength,
        freshness:  profile.freshness,
        abv:        profile.abv,
        popularity: pop,
      },
    });

    for (const ing of c.ingredients) {
      const normalizedName = normalize(ing.name);
      const ingredientId = ingredientIdMap.get(normalizedName);
      if (!ingredientId) continue;
      await prisma.cocktailIngredient.create({
        data: {
          cocktailId:   cocktail.id,
          ingredientId,
          amount: ing.quantity != null ? `${ing.quantity}cl` : "적당량",
        },
      });
    }

    cocktailCount++;
  }

  console.log(`✅ Created ${cocktailCount} cocktails`);
  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
