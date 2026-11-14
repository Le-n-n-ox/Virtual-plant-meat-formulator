import pytest
from app.config import Settings
from app.mlops.datasets import load_hme_dataset
from app.mlops.training import train_target


@pytest.fixture(scope="session")
def dataset():
    return load_hme_dataset(Settings().data_dir)


@pytest.fixture(scope="session")
def hardness_outcome(dataset):
    return train_target("hardness", dataset, seed=42, min_training_samples=30)
