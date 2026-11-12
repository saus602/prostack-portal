"""ProStack approval-probability trainer. Runs on YOUR computer. No cloud AI.

Input: anonymized outcomes (CSV with columns issuer,card_id,score_band,new_accounts_24m,approved,credit_limit),
exported by an ADMIN through the training_export() function (it returns nothing until 100+ decisions exist).

    python train.py outcomes.csv            # train, calibrate, and gate
    python train.py --selftest              # check the pipeline on synthetic data
    python simulate_test.py             # simulation tests of the gate (planted signal, noise, edge cases)

The model is only saved (model.json) if it beats the baseline (the plain approval rate) on held-out
outcomes AND is not worse than the previous model's calibration. Otherwise nothing changes and the
app keeps its rule-based labels. Needs: pip install scikit-learn numpy
"""
import sys, json, csv, os
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss
from sklearn.model_selection import train_test_split

MIN_PER_ISSUER = 300   # per the build plan: a few hundred outcomes per issuer before a model goes live
MIN_TOTAL = 300
MIN_GAIN = 0.02        # model must beat the plain approval rate by at least 2% (relative Brier) so chance wins on noise are rejected

def load(path):
    rows = list(csv.DictReader(open(path)))
    X, y, iss = [], [], []
    for r in rows:
        X.append([float(r['score_band']), float(r['new_accounts_24m'])]); y.append(1 if str(r['approved']).lower() in ('1', 'true', 't') else 0); iss.append(r['issuer'])
    return np.array(X), np.array(y), np.array(iss)

def issuer_features(iss, vocab):
    return np.array([[1.0 if i == v else 0.0 for v in vocab] for i in iss])

def run(X, y, iss, prev_brier=None, out='model.json'):
    counts = {i: int((iss == i).sum()) for i in set(iss)}
    vocab = sorted(i for i, n in counts.items() if n >= MIN_PER_ISSUER)
    if len(y) < MIN_TOTAL or not vocab:
        return 'not enough outcomes yet (need %d per issuer; have %s)' % (MIN_PER_ISSUER, counts)
    if len(set(y.tolist())) < 2:
        return 'gate: all outcomes are the same (all approved or all denied); nothing to learn yet'
    keep = np.isin(iss, vocab)
    X, y, iss = X[keep], y[keep], iss[keep]
    F = np.hstack([X, issuer_features(iss, vocab)])
    Ftr, Fte, ytr, yte = train_test_split(F, y, test_size=0.3, random_state=7, stratify=y)
    Ftr, Fcal, ytr, ycal = train_test_split(Ftr, ytr, test_size=0.3, random_state=7, stratify=ytr)
    m = HistGradientBoostingClassifier(max_depth=3, max_iter=120, learning_rate=0.05, random_state=7).fit(Ftr, ytr)
    iso = IsotonicRegression(out_of_bounds='clip').fit(m.predict_proba(Fcal)[:, 1], ycal)
    p = iso.predict(m.predict_proba(Fte)[:, 1])
    brier = brier_score_loss(yte, p); base = brier_score_loss(yte, np.full_like(p, ytr.mean()))
    if brier > base * (1 - MIN_GAIN):
        return 'gate: model (%.4f) does not beat the plain approval rate (%.4f) by %d%%; keeping rule-based labels' % (brier, base, MIN_GAIN * 100)
    if prev_brier is not None and brier > prev_brier:
        return 'gate: model (%.4f) calibrates worse than the previous one (%.4f); keeping the previous one' % (brier, prev_brier)
    # Save a small, portable summary: calibrated approval rate by issuer and score band (what the app can display)
    table = {}
    pall = iso.predict(m.predict_proba(F)[:, 1])
    for i in vocab:
        for s in sorted(set(X[iss == i][:, 0])):
            mask = (iss == i) & (X[:, 0] == s)
            if mask.sum() >= 20: table['%s|%d' % (i, int(s))] = round(float(pall[mask].mean()), 3)
    json.dump({'brier': brier, 'baseline_brier': base, 'n': int(len(y)), 'table': table}, open(out, 'w'), indent=1)
    return 'saved %s (brier %.4f vs baseline %.4f, n=%d)' % (out, brier, base, len(y))

def selftest():
    rng = np.random.default_rng(1)
    n = 2400
    iss = rng.choice(['Chase', 'American Express', 'Capital One'], n)
    score = rng.choice([660, 700, 740, 780], n); new24 = rng.integers(0, 8, n)
    z = (score - 700) / 40.0 - 0.45 * (new24 - 2) - np.where(iss == 'Chase', 0.4 * (new24 >= 5) * 3, 0)
    y = (rng.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    X = np.column_stack([score, new24]).astype(float)
    print(run(X, y, iss, out='/tmp/selftest_model.json'))
    print(run(X[:100], y[:100], iss[:100], out='/tmp/selftest_model2.json'))
    noise = (rng.random(n) < 0.5).astype(int)
    print(run(X, noise, iss, out='/tmp/selftest_model3.json'))

if __name__ == '__main__':
    if '--selftest' in sys.argv: selftest()
    elif len(sys.argv) > 1:
        X, y, iss = load(sys.argv[1]); prev = None
        if os.path.exists('model.json'): prev = json.load(open('model.json')).get('brier')
        print(run(X, y, iss, prev))
    else: print(__doc__)
