"""Simulation tests for the approval-probability trainer (train.py).

Simulated outcomes can show the pipeline and its gate behave correctly. They CANNOT show the model
predicts real issuers: the fake data comes from rules we write, so a model only learns them back.
Real validation needs real outcomes (see MIN_PER_ISSUER in train.py).

    python simulate_test.py
"""
import json, os, tempfile
import numpy as np
import train

TMP = tempfile.mkdtemp()
BANDS = [1, 2, 3, 4, 5]


def make(n, seed, signal=True, issuers=('Chase', 'American Express', 'Capital One')):
    rng = np.random.default_rng(seed)
    iss = rng.choice(list(issuers), n)
    band = rng.choice(BANDS, n).astype(float)
    new24 = rng.integers(0, 8, n).astype(float)
    if signal:
        z = 0.9 * (band - 3) - 0.4 * (new24 - 2)
        p = 1 / (1 + np.exp(-z))
    else:
        p = np.full(n, 0.5)
    y = (rng.random(n) < p).astype(int)
    return np.column_stack([band, new24]), y, iss, p


def out(name):
    return os.path.join(TMP, name)


def test_planted_signal_passes_and_is_calibrated():
    X, y, iss, p = make(6000, 11)
    res = train.run(X, y, iss, out=out('m1.json'))
    assert res.startswith('saved'), res
    m = json.load(open(out('m1.json')))
    assert m['brier'] < m['baseline_brier']
    # approval rate must rise with score band, for every issuer
    for i in ('Chase', 'American Express', 'Capital One'):
        vals = [m['table'].get('%s|%d' % (i, b)) for b in BANDS]
        assert None not in vals, vals
        assert all(a <= b + 0.03 for a, b in zip(vals, vals[1:])), (i, vals)
        assert vals[-1] - vals[0] > 0.2, (i, vals)
    # calibration: table value close to the true mean probability of that cell
    for key, v in m['table'].items():
        i, b = key.split('|')
        mask = (iss == i) & (X[:, 0] == int(b))
        assert abs(v - p[mask].mean()) < 0.12, (key, v, p[mask].mean())
    print('planted signal: passed, ordered, calibrated')


def test_pure_noise_is_rejected():
    passes = 0
    seeds = range(30)
    for s in seeds:
        X, y, iss, _ = make(2400, 100 + s, signal=False)
        if train.run(X, y, iss, out=out('noise%d.json' % s)).startswith('saved'):
            passes += 1
    rate = passes / len(seeds)
    print('pure noise passed the gate in %d of %d runs (%.0f%%)' % (passes, len(seeds), rate * 100))
    assert rate <= 0.05, rate


def test_small_issuers_are_excluded_and_too_little_data_waits():
    X, y, iss, _ = make(3000, 5, issuers=('Chase', 'Amex'))
    X2, y2, iss2, _ = make(120, 6, issuers=('Tiny Bank',))
    XA, yA, issA = np.vstack([X, X2]), np.concatenate([y, y2]), np.concatenate([iss, iss2])
    res = train.run(XA, yA, issA, out=out('m2.json'))
    assert res.startswith('saved'), res
    assert not any(k.startswith('Tiny Bank') for k in json.load(open(out('m2.json')))['table'])
    low = train.run(X[:150], y[:150], iss[:150], out=out('m3.json'))
    assert low.startswith('not enough outcomes'), low
    assert not os.path.exists(out('m3.json'))
    print('small issuers excluded; too little data waits')


def test_previous_model_gate_blocks_worse_calibration():
    X, y, iss, _ = make(4000, 21)
    res = train.run(X, y, iss, prev_brier=0.0001, out=out('m4.json'))
    assert res.startswith('gate:') and 'previous' in res, res
    assert not os.path.exists(out('m4.json'))
    print('worse-than-previous model is blocked')


def test_one_sided_outcomes_do_not_crash():
    X, y, iss, _ = make(1500, 3)
    res = train.run(X, np.ones_like(y), iss, out=out('m5.json'))
    assert res.startswith('gate: all outcomes are the same'), res
    print('all-approved data refused')


if __name__ == '__main__':
    test_planted_signal_passes_and_is_calibrated()
    test_pure_noise_is_rejected()
    test_small_issuers_are_excluded_and_too_little_data_waits()
    test_previous_model_gate_blocks_worse_calibration()
    try:
        test_one_sided_outcomes_do_not_crash()
    except Exception as e:  # report, do not hide
        print('one-sided outcomes raised:', type(e).__name__, e)
        raise
    print('SIMULATION TESTS OK')
