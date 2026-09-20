"""Measuring a trained model on data it never learned from."""

from ored.evaluation.evaluator import evaluate_checkpoint

__all__ = ["evaluate_checkpoint"]
