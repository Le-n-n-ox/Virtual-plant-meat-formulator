from decimal import Decimal as D

import pytest
from app.domain.amino_acids import (
    CALC_VERSION,
    per_gram_protein_coefficients,
    score_amino_acids,
)
from app.domain.types import AminoAcidPattern, IngredientData, Line, NutrientRow

SAA = "sulfur_amino_acids_methionine_cysteine"
AAA = "aromatic_amino_acids_phenylalanine_tyrosine"
FAO_2013_ADULT = AminoAcidPattern(
    id="aap_test",
    name="FAO 2013 adult",
    version="2013",
    values={
        "histidine": D("16"),
        "isoleucine": D("30"),
        "leucine": D("61"),
        "lysine": D("48"),
        SAA: D("23"),
        AAA: D("41"),
        "threonine": D("25"),
        "tryptophan": D("6.6"),
        "valine": D("40"),
    },
    groupings={SAA: ["methionine", "cysteine"], AAA: ["phenylalanine", "tyrosine"]},
)

# Ingredient A: protein 20 g, B: protein 10 g; all amino acids at 2x the pattern per g protein
# (A: 40*R mg/100 g, B: 20*R mg/100 g) except lysine (800 / 400) and SAA.
A_AA = {
    "histidine": 640,
    "isoleucine": 1200,
    "leucine": 2440,
    "lysine": 800,
    "methionine": 300,
    "cysteine": 100,
    "phenylalanine": 1000,
    "tyrosine": 640,
    "threonine": 1000,
    "tryptophan": 264,
    "valine": 1600,
}
B_AA = {
    "histidine": 320,
    "isoleucine": 600,
    "leucine": 1220,
    "lysine": 400,
    "methionine": 100,
    "cysteine": 100,
    "phenylalanine": 500,
    "tyrosine": 320,
    "threonine": 500,
    "tryptophan": 132,
    "valine": 800,
}


def make(id_, protein, aas):
    rows = {"protein": NutrientRow("protein", D(protein), "g")}
    rows.update({k: NutrientRow(k, D(v), "mg") for k, v in aas.items()})
    return IngredientData(id=id_, common_name=id_, nutrients=rows)


LINES = [Line("a", D("50")), Line("b", D("50"))]


def approx(x, y):
    return abs(x - y) < D("1e-20")


def test_golden_grouped_pattern():
    ings = {"a": make("a", 20, A_AA), "b": make("b", 10, B_AA)}
    res = score_amino_acids(LINES, ings, FAO_2013_ADULT)
    # protein = 0.5*20 + 0.5*10 = 15 g
    # lysine: (0.5*800 + 0.5*400)/15 = 600/15 = 40 mg/g -> 40/48 = 0.8333
    assert res.per_g_protein_mg["lysine"] == D("40")
    assert approx(res.scores["lysine"], D(40) / D(48))
    # SAA: met+cys = 0.5*400 + 0.5*200 = 300 -> 20 mg/g -> 20/23 = 0.8696
    assert res.per_g_protein_mg[SAA] == D("20")
    assert approx(res.scores[SAA], D(20) / D(23))
    # AAA: 0.5*1640 + 0.5*820 = 1230 -> 82 mg/g -> 82/41 = 2
    assert res.per_g_protein_mg[AAA] == D("82")
    assert res.scores[AAA] == D("2")
    assert res.limiting_amino_acid == "lysine"
    assert approx(res.score, D(40) / D(48))
    assert res.complete and res.missing == []


def test_payload_shape():
    ings = {"a": make("a", 20, A_AA), "b": make("b", 10, B_AA)}
    p = score_amino_acids(LINES, ings, FAO_2013_ADULT).to_payload()
    assert set(p) == {
        "per_g_protein_mg",
        "reference_pattern",
        "scores",
        "limiting_amino_acid",
        "score",
        "method",
        "complete",
        "missing",
    }
    assert p["reference_pattern"] == {"id": "aap_test", "name": "FAO 2013 adult", "version": "2013"}
    assert p["method"] == "AAS"
    assert {"key": "lysine", "value": 40.0} in p["per_g_protein_mg"]
    assert "DIAAS" not in repr(p).upper()
    assert CALC_VERSION == "aas-1.0.0"


def test_missing_amino_acid_marks_incomplete():
    b = dict(B_AA)
    del b["cysteine"]
    ings = {"a": make("a", 20, A_AA), "b": make("b", 10, b)}
    res = score_amino_acids(LINES, ings, FAO_2013_ADULT)
    assert res.complete is False
    assert res.missing == [SAA]
    assert res.scores[SAA] is None and res.per_g_protein_mg[SAA] is None
    assert res.limiting_amino_acid == "lysine"  # among available
    p = res.to_payload()
    assert p["missing"] == [SAA]
    assert {"key": SAA, "score": None} in p["scores"]


def test_zero_or_missing_protein():
    zero = make("a", 0, A_AA)
    res = score_amino_acids([Line("a", D("100"))], {"a": zero}, FAO_2013_ADULT)
    assert res.score is None and res.limiting_amino_acid is None
    assert res.complete is False and len(res.missing) == len(FAO_2013_ADULT.values)
    nop = IngredientData(id="n", common_name="n", nutrients={})
    res = score_amino_acids([Line("n", D("100"))], {"n": nop}, FAO_2013_ADULT)
    assert res.complete is False and res.score is None


def test_per_gram_protein_coefficients():
    ings = {"a": make("a", 20, A_AA), "b": make("b", 10, B_AA)}
    coefs = per_gram_protein_coefficients(ings, ["a", "b", "x"], FAO_2013_ADULT)
    # lysine: c = aa - R*protein = 800 - 48*20 = -160 ; 400 - 48*10 = -80
    assert coefs["lysine"] == [D("-160"), D("-80"), None]
    # SAA: 400 - 23*20 = -60 ; 200 - 23*10 = -30
    assert coefs[SAA][:2] == [D("-60"), D("-30")]
    # constraint sum x_i c_i >= 0 with x = (0.5, 0.5): -120 < 0 <=> score 0.83 < 1
    assert sum(D("0.5") * c for c in coefs["lysine"][:2]) == D("-120")


@pytest.mark.parametrize("key", list(FAO_2013_ADULT.values))
def test_single_ingredient_score_matches_ratio(key):
    ings = {"a": make("a", 20, A_AA)}
    res = score_amino_acids([Line("a", D("100"))], ings, FAO_2013_ADULT)
    members = FAO_2013_ADULT.groupings.get(key, [key])
    expected = D(sum(A_AA[m] for m in members)) / 20 / FAO_2013_ADULT.values[key]
    assert approx(res.scores[key], expected)
