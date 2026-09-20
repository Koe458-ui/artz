#!/usr/bin/env python3
"""A hands-on demonstration of backpropagation, with the maths written out.

Run it:  python scripts/explain_backprop.py

This script trains nothing useful. Its only purpose is to show -- on numbers
small enough to check with a pencil -- that:

  1. a forward pass is multiply-and-add,
  2. the loss is one number,
  3. the gradient of that number with respect to a weight can be derived by
     hand with the chain rule,
  4. PyTorch's .backward() computes exactly the same numbers,
  5. a finite-difference check ("nudge the weight, see how the loss moves")
     agrees with both,
  6. taking one optimizer step lowers the loss.

If you understand this file, you understand what src/ored/training/trainer.py
is doing 12 times per epoch on a bigger network.
"""

import _bootstrap  # noqa: F401

import torch

from ored.utils.logging_utils import get_logger, section

logger = get_logger("ored.explain")


def main() -> int:
    torch.manual_seed(0)

    logger.info(section("1. THE SMALLEST POSSIBLE NETWORK"))
    logger.info("""
One neuron, two inputs, one output. No activation yet.

    y_hat = w1*x1 + w2*x2 + b

Three parameters: w1, w2, b. We choose their values by hand so every number
below can be verified with a pencil.
""")

    # requires_grad=True tells PyTorch: "this is a parameter -- track every
    # operation involving it, so I can ask for dLoss/dThis later."
    w = torch.tensor([0.5, -1.0], requires_grad=True)   # the weights
    b = torch.tensor(0.25, requires_grad=True)          # the bias

    x = torch.tensor([2.0, 3.0])   # the input  (not a parameter: fixed data)
    y = torch.tensor(1.0)          # the target (the correct answer)

    logger.info(f"weights w = {w.tolist()}    bias b = {b.item()}")
    logger.info(f"input   x = {x.tolist()}    target y = {y.item()}")

    # ---------------------------------------------------------------- forward
    logger.info(section("2. FORWARD PASS"))
    y_hat = (w * x).sum() + b
    logger.info(f"""
    y_hat = w1*x1 + w2*x2 + b
          = {w[0].item()}*{x[0].item()} + ({w[1].item()})*{x[1].item()} + {b.item()}
          = {y_hat.item()}

The model says {y_hat.item()}. The truth is {y.item()}. It is wrong, and we now
need a single number saying *how* wrong.""")

    # ------------------------------------------------------------------- loss
    logger.info(section("3. LOSS"))
    loss = (y_hat - y) ** 2   # squared error
    error = (y_hat - y).item()
    logger.info(f"""
    loss = (y_hat - y)^2 = ({y_hat.item()} - {y.item()})^2 = {loss.item()}

Squaring does two jobs: it makes the loss positive regardless of the direction
of the error, and it punishes large errors disproportionately.""")

    # -------------------------------------------------------------- by hand
    logger.info(section("4. THE GRADIENT, DERIVED BY HAND"))
    logger.info(f"""
We want dLoss/dw1: "if w1 grows slightly, what happens to the loss?"
w1 does not touch the loss directly -- it goes through y_hat. That is what the
chain rule is for:

    dLoss/dw1 = dLoss/dy_hat  *  dy_hat/dw1

    dLoss/dy_hat = 2 * (y_hat - y)   = 2 * ({error})     = {2 * error}
    dy_hat/dw1   = x1                                     = {x[0].item()}
    ------------------------------------------------------------------
    dLoss/dw1    = {2 * error} * {x[0].item()} = {2 * error * x[0].item()}

Same for the rest:
    dLoss/dw2 = 2*(y_hat - y) * x2 = {2 * error} * {x[1].item()} = {2 * error * x[1].item()}
    dLoss/db  = 2*(y_hat - y) * 1  = {2 * error}

Read the first one aloud: the gradient for a weight is the error times the
input that weight was multiplied by. A weight attached to a large input is
blamed more for the mistake. That is the whole intuition behind
backpropagation; deeper networks just chain more of these factors together.""")

    manual = {
        "w1": 2 * error * x[0].item(),
        "w2": 2 * error * x[1].item(),
        "b": 2 * error,
    }

    # -------------------------------------------------------------- autograd
    logger.info(section("5. THE SAME GRADIENT, FROM .backward()"))
    loss.backward()   # walks the recorded graph in reverse, filling .grad
    logger.info(f"""
    w.grad = {w.grad.tolist()}
    b.grad = {b.grad.item()}

    by hand: w1 {manual['w1']:.4f}   w2 {manual['w2']:.4f}   b {manual['b']:.4f}
    autograd: w1 {w.grad[0].item():.4f}   w2 {w.grad[1].item():.4f}   b {b.grad.item():.4f}

Identical. PyTorch is not doing anything mysterious -- it applies the same
chain rule, just automatically and for millions of parameters at a time.""")

    assert abs(w.grad[0].item() - manual["w1"]) < 1e-6
    assert abs(w.grad[1].item() - manual["w2"]) < 1e-6
    assert abs(b.grad.item() - manual["b"]) < 1e-6

    # ------------------------------------------------- finite-difference check
    logger.info(section("6. AN INDEPENDENT CHECK: JUST NUDGE THE WEIGHT"))
    eps = 1e-4
    with torch.no_grad():
        def loss_at(w1_value: float) -> float:
            w_test = torch.tensor([w1_value, w[1].item()])
            return (((w_test * x).sum() + b) - y).pow(2).item()

        numerical = (loss_at(w[0].item() + eps) - loss_at(w[0].item() - eps)) / (2 * eps)

    logger.info(f"""
Forget calculus for a second. Increase w1 by {eps}, measure the loss; decrease
it by {eps}, measure again; divide the difference by the distance:

    numerical dLoss/dw1 = {numerical:.6f}
    analytic  dLoss/dw1 = {w.grad[0].item():.6f}

They agree. The gradient really is just "the slope of the loss with respect to
this weight". (We do not train this way -- it would need two forward passes per
weight, so 3,018 passes for our 1,509-parameter MLP instead of one backward
pass.)""")

    # ------------------------------------------------------------ the update
    logger.info(section("7. THE WEIGHT UPDATE"))
    learning_rate = 0.01
    logger.info(f"""
The gradient points in the direction that *increases* the loss, so we step the
other way:

    w <- w - learning_rate * dLoss/dw     (learning_rate = {learning_rate})""")

    before = (w.detach().clone(), b.detach().clone())
    with torch.no_grad():   # updating weights is not itself a tracked operation
        w -= learning_rate * w.grad
        b -= learning_rate * b.grad

    logger.info(f"""
    w: {before[0].tolist()}  ->  {w.detach().tolist()}
    b: {before[1].item():.4f}  ->  {b.item():.4f}""")

    with torch.no_grad():
        new_y_hat = (w * x).sum() + b
        new_loss = (new_y_hat - y) ** 2

    logger.info(f"""
    loss before update : {loss.item():.6f}
    loss after  update : {new_loss.item():.6f}     <- smaller. It learned.

One step, one batch, one tiny improvement. Training is this repeated thousands
of times -- and that is literally all it is.""")

    # ----------------------------------------------------------- 20 more steps
    logger.info(section("8. REPEAT 20 TIMES"))
    w2 = torch.tensor([0.5, -1.0], requires_grad=True)
    b2 = torch.tensor(0.25, requires_grad=True)
    logger.info(f"{'step':>6}{'loss':>14}{'w1':>10}{'w2':>10}{'b':>10}")
    logger.info("-" * 50)
    for step in range(21):
        y_hat2 = (w2 * x).sum() + b2
        step_loss = (y_hat2 - y) ** 2
        if step % 4 == 0:
            logger.info(
                f"{step:>6}{step_loss.item():>14.8f}"
                f"{w2[0].item():>10.4f}{w2[1].item():>10.4f}{b2.item():>10.4f}"
            )
        if w2.grad is not None:
            w2.grad.zero_()          # exactly what optimizer.zero_grad() does
            b2.grad.zero_()
        step_loss.backward()
        with torch.no_grad():
            w2 -= learning_rate * w2.grad
            b2 -= learning_rate * b2.grad

    logger.info("""
The loss falls toward zero: the neuron has found weights that map this input to
this target. With a full dataset and a deeper network, the same procedure has
to find weights that work for *every* example at once -- which is exactly what
scripts/train.py does.

Next:  python scripts/train.py""")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
