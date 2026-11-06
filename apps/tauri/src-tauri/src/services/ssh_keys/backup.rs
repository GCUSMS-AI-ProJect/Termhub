use std::collections::{HashMap, HashSet};
use std::fs;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use zeroize::Zeroize;

use super::{
    ensure_store, inspect_private_key, inspect_private_key_bytes, lock_down_file, read_index,
    read_secrets, write_bytes_atomic, write_index, write_secrets, InspectedPrivateKey, KeyPaths,
    StoredSshKey,
};
use crate::services::backup_crypto::zeroize_values;
use crate::AppError;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupSshKey {
    #[serde(flatten)]
    pub key: StoredSshKey,
    pub private_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
}

impl Drop for BackupSshKey {
    fn drop(&mut self) {
        self.private_key.zeroize();
        if let Some(passphrase) = &mut self.passphrase {
            passphrase.zeroize();
        }
    }
}

#[derive(Default)]
pub(crate) struct SshKeyRestoreSummary {
    pub imported: u64,
    pub updated: u64,
}

pub(crate) fn export_for_backup(app: &AppHandle) -> Result<Vec<Value>, AppError> {
    let paths = ensure_store(app)?;
    let index = read_index(&paths)?;
    let secrets = read_secrets(&paths)?;
    let mut backups = Vec::with_capacity(index.keys.len());

    for key in index.keys {
        let key_path = paths.key_path(&key.id)?;
        lock_down_file(&key_path)?;
        let mut inspected = inspect_private_key(&key_path)?;
        ensure_key_metadata_matches(&key, &inspected)?;
        let private_key = String::from_utf8(std::mem::take(&mut inspected.bytes))
            .map_err(|error| AppError::Storage(format!("SSH 私钥编码无效: {error}")))?;
        backups.push(BackupSshKey {
            passphrase: secrets.passphrases.get(&key.id).cloned(),
            key,
            private_key,
        });
    }

    validate_backup_records(&backups)?;
    backups
        .iter()
        .map(|backup| {
            serde_json::to_value(backup).map_err(|error| AppError::Serialization(error.to_string()))
        })
        .collect()
}

pub(crate) fn merge_for_upload(
    remote: Option<&[Value]>,
    mut local: Vec<Value>,
) -> Result<Vec<Value>, AppError> {
    let mut remote = remote.unwrap_or_default().to_vec();
    if let Err(error) = validate_backup_values(&remote) {
        zeroize_values(&mut remote);
        zeroize_values(&mut local);
        return Err(error);
    }
    if let Err(error) = validate_backup_values(&local) {
        zeroize_values(&mut remote);
        zeroize_values(&mut local);
        return Err(error);
    }

    let mut positions = HashMap::with_capacity(remote.len() + local.len());
    for (position, value) in remote.iter().enumerate() {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .expect("validated SSH key has an id")
            .to_string();
        positions.insert(id, position);
    }

    let result = (|| {
        for value in &local {
            let id = value
                .get("id")
                .and_then(Value::as_str)
                .expect("validated SSH key has an id");
            if let Some(position) = positions.get(id).copied() {
                if remote[position].get("fingerprint") != value.get("fingerprint") {
                    return Err(AppError::Command(
                        "云端与本地存在 ID 相同但内容不同的 SSH 密钥，已停止合并。".to_string(),
                    ));
                }
                remote[position] = value.clone();
            } else {
                positions.insert(id.to_string(), remote.len());
                remote.push(value.clone());
            }
        }
        Ok(())
    })();
    zeroize_values(&mut local);
    match result {
        Ok(()) => Ok(remote),
        Err(error) => {
            zeroize_values(&mut remote);
            Err(error)
        }
    }
}

pub(crate) fn restore_for_backup(
    app: &AppHandle,
    incoming: &[Value],
) -> Result<SshKeyRestoreSummary, AppError> {
    let backups: Vec<BackupSshKey> = serde_json::from_value(Value::Array(incoming.to_vec()))
        .map_err(|error| AppError::Command(format!("备份中的 SSH 密钥格式无效: {error}")))?;
    validate_backup_records(&backups)?;
    let paths = ensure_store(app)?;
    restore_backup_at(&paths, &backups)
}

fn validate_backup_values(values: &[Value]) -> Result<(), AppError> {
    let backups: Vec<BackupSshKey> = serde_json::from_value(Value::Array(values.to_vec()))
        .map_err(|error| AppError::Command(format!("备份中的 SSH 密钥格式无效: {error}")))?;
    validate_backup_records(&backups)
}

fn validate_backup_records(backups: &[BackupSshKey]) -> Result<(), AppError> {
    let mut ids = HashSet::with_capacity(backups.len());
    for backup in backups {
        uuid::Uuid::parse_str(&backup.key.id)
            .map_err(|_| AppError::Command("备份包含无效的 SSH 密钥 ID。".to_string()))?;
        if !ids.insert(&backup.key.id) {
            return Err(AppError::Command(
                "备份包含重复的 SSH 密钥 ID。".to_string(),
            ));
        }
        let inspected = inspect_private_key_bytes(
            backup.private_key.as_bytes().to_vec(),
            backup.key.name.clone(),
            "备份中的 SSH 私钥",
        )?;
        ensure_key_metadata_matches(&backup.key, &inspected)?;
    }
    Ok(())
}

fn ensure_key_metadata_matches(
    key: &StoredSshKey,
    inspected: &InspectedPrivateKey,
) -> Result<(), AppError> {
    if key.algorithm != inspected.algorithm
        || key.fingerprint != inspected.fingerprint
        || key.encrypted != inspected.encrypted
    {
        return Err(AppError::Command(
            "SSH 私钥内容与密钥元数据不匹配。".to_string(),
        ));
    }
    Ok(())
}

fn restore_backup_at(
    paths: &KeyPaths,
    backups: &[BackupSshKey],
) -> Result<SshKeyRestoreSummary, AppError> {
    let mut index = read_index(paths)?;
    let mut secrets = read_secrets(paths)?;
    let previous_secrets = secrets.clone();
    let mut positions = HashMap::with_capacity(index.keys.len() + backups.len());
    for (position, key) in index.keys.iter().enumerate() {
        if positions.insert(key.id.clone(), position).is_some() {
            return Err(AppError::Storage("SSH 密钥索引包含重复 ID。".to_string()));
        }
    }

    let mut summary = SshKeyRestoreSummary::default();
    let mut new_keys = Vec::new();
    let mut files_to_write = Vec::new();
    let mut index_changed = false;
    let mut secrets_changed = false;

    for backup in backups {
        let existing_position = positions.get(&backup.key.id).copied();
        if let Some(position) = existing_position {
            let existing = &index.keys[position];
            if existing.fingerprint != backup.key.fingerprint {
                return Err(AppError::Command(
                    "本地与备份存在 ID 相同但内容不同的 SSH 密钥，已停止导入。".to_string(),
                ));
            }
        }

        let key_path = paths.key_path(&backup.key.id)?;
        let file_exists = key_path.exists();
        if file_exists {
            lock_down_file(&key_path)?;
            let local_key = inspect_private_key(&key_path)?;
            if local_key.fingerprint != backup.key.fingerprint {
                return Err(AppError::Command(
                    "本地 SSH 私钥文件与备份内容冲突，已停止导入。".to_string(),
                ));
            }
        } else {
            files_to_write.push((key_path, backup.private_key.as_str()));
        }

        let mut key_updated = !file_exists && existing_position.is_some();
        if let Some(position) = existing_position {
            if index.keys[position] != backup.key {
                index.keys[position] = backup.key.clone();
                index_changed = true;
                key_updated = true;
            }
        } else {
            positions.insert(backup.key.id.clone(), index.keys.len() + new_keys.len());
            new_keys.push(backup.key.clone());
            summary.imported += 1;
            index_changed = true;
        }

        let next_passphrase = backup
            .passphrase
            .as_deref()
            .filter(|value| !value.is_empty());
        if secrets.passphrases.get(&backup.key.id).map(String::as_str) != next_passphrase {
            if let Some(mut previous) = secrets.passphrases.remove(&backup.key.id) {
                previous.zeroize();
            }
            if let Some(passphrase) = next_passphrase {
                secrets
                    .passphrases
                    .insert(backup.key.id.clone(), passphrase.to_string());
            }
            secrets_changed = true;
            key_updated = true;
        }
        if key_updated && existing_position.is_some() {
            summary.updated += 1;
        }
    }

    index.keys.splice(0..0, new_keys);
    let mut created_files = Vec::new();
    for (path, private_key) in files_to_write {
        if let Err(error) = write_bytes_atomic(&path, private_key.as_bytes()) {
            for created in &created_files {
                let _ = fs::remove_file(created);
            }
            return Err(error);
        }
        created_files.push(path);
    }

    if secrets_changed {
        if let Err(error) = write_secrets(paths, &secrets) {
            for created in &created_files {
                let _ = fs::remove_file(created);
            }
            return Err(error);
        }
    }
    if index_changed {
        if let Err(error) = write_index(paths, &index) {
            if secrets_changed {
                let _ = write_secrets(paths, &previous_secrets);
            }
            for created in &created_files {
                let _ = fs::remove_file(created);
            }
            return Err(error);
        }
    }
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::super::{
        inspect_private_key_text, read_secrets, KeyPaths, StoredSshKey, StoredSshKeyIndex,
        StoredSshKeySecrets,
    };
    use super::{restore_backup_at, validate_backup_records, BackupSshKey};
    use crate::services::backup_crypto::zeroize_values;
    use std::fs;

    #[test]
    fn restores_validated_private_key_and_encrypts_its_saved_passphrase_locally() {
        let root =
            std::env::temp_dir().join(format!("transterm-ssh-key-backup-{}", uuid::Uuid::new_v4()));
        let keys_dir = root.join("ssh-keys");
        fs::create_dir_all(&keys_dir).unwrap();
        let paths = KeyPaths {
            storage_root: root.clone(),
            keys_dir,
            index_path: root.join("ssh-keys.json"),
            secrets_path: root.join("ssh-key-secrets.json"),
        };
        super::write_index(
            &paths,
            &StoredSshKeyIndex {
                version: 1,
                keys: Vec::new(),
            },
        )
        .unwrap();
        super::write_secrets(&paths, &StoredSshKeySecrets::default()).unwrap();

        let key = russh::keys::PrivateKey::random(
            &mut rand::rng(),
            russh::keys::ssh_key::Algorithm::Ed25519,
        )
        .unwrap();
        let private_key = key
            .to_openssh(russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let inspected = inspect_private_key_text(&private_key).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let backup = BackupSshKey {
            key: StoredSshKey {
                id: id.clone(),
                name: "id_ed25519".to_string(),
                note: Some("work".to_string()),
                algorithm: inspected.algorithm.clone(),
                fingerprint: inspected.fingerprint.clone(),
                encrypted: inspected.encrypted,
                imported_at: 123,
            },
            private_key: private_key.to_string(),
            passphrase: Some("key passphrase".to_string()),
        };
        validate_backup_records(std::slice::from_ref(&backup)).unwrap();

        let summary = restore_backup_at(&paths, std::slice::from_ref(&backup)).unwrap();
        assert_eq!(summary.imported, 1);
        assert_eq!(summary.updated, 0);
        assert_eq!(
            fs::read_to_string(paths.key_path(&id).unwrap()).unwrap(),
            private_key.as_str()
        );
        assert_eq!(
            read_secrets(&paths)
                .unwrap()
                .passphrases
                .get(&id)
                .map(String::as_str),
            Some("key passphrase")
        );
        let raw_secrets = fs::read_to_string(&paths.secrets_path).unwrap();
        assert!(!raw_secrets.contains("key passphrase"));

        let second_key = russh::keys::PrivateKey::random(
            &mut rand::rng(),
            russh::keys::ssh_key::Algorithm::Ed25519,
        )
        .unwrap();
        let second_private_key = second_key
            .to_openssh(russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let second_inspected = inspect_private_key_text(&second_private_key).unwrap();
        let second_id = uuid::Uuid::new_v4().to_string();
        let second_backup = BackupSshKey {
            key: StoredSshKey {
                id: second_id,
                name: "id_ed25519_secondary".to_string(),
                note: None,
                algorithm: second_inspected.algorithm.clone(),
                fingerprint: second_inspected.fingerprint.clone(),
                encrypted: second_inspected.encrypted,
                imported_at: 456,
            },
            private_key: second_private_key.to_string(),
            passphrase: None,
        };
        let merge_summary =
            restore_backup_at(&paths, std::slice::from_ref(&second_backup)).unwrap();
        assert_eq!(merge_summary.imported, 1);
        assert_eq!(super::read_index(&paths).unwrap().keys.len(), 2);
        assert!(paths.key_path(&id).unwrap().exists());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_backup_key_metadata_that_does_not_match_its_private_key() {
        let key = russh::keys::PrivateKey::random(
            &mut rand::rng(),
            russh::keys::ssh_key::Algorithm::Ed25519,
        )
        .unwrap();
        let private_key = key
            .to_openssh(russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let backup = BackupSshKey {
            key: StoredSshKey {
                id: uuid::Uuid::new_v4().to_string(),
                name: "id_ed25519".to_string(),
                note: None,
                algorithm: "ssh-ed25519".to_string(),
                fingerprint: "SHA256:tampered".to_string(),
                encrypted: false,
                imported_at: 123,
            },
            private_key: private_key.to_string(),
            passphrase: None,
        };
        assert!(validate_backup_records(std::slice::from_ref(&backup)).is_err());
    }

    #[test]
    fn cloud_merge_keeps_the_union_and_prefers_local_metadata() {
        let generated = russh::keys::PrivateKey::random(
            &mut rand::rng(),
            russh::keys::ssh_key::Algorithm::Ed25519,
        )
        .unwrap();
        let private_key = generated
            .to_openssh(russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let inspected = inspect_private_key_text(&private_key).unwrap();
        let key_id = uuid::Uuid::new_v4().to_string();
        let key = StoredSshKey {
            id: key_id.clone(),
            name: "id_ed25519".to_string(),
            note: Some("remote note".to_string()),
            algorithm: inspected.algorithm.clone(),
            fingerprint: inspected.fingerprint.clone(),
            encrypted: inspected.encrypted,
            imported_at: 123,
        };
        let remote_record = BackupSshKey {
            key: key.clone(),
            private_key: private_key.to_string(),
            passphrase: None,
        };
        let local_record = BackupSshKey {
            key: StoredSshKey {
                note: Some("local note".to_string()),
                ..key
            },
            private_key: private_key.to_string(),
            passphrase: Some("local passphrase".to_string()),
        };
        let other_generated = russh::keys::PrivateKey::random(
            &mut rand::rng(),
            russh::keys::ssh_key::Algorithm::Ed25519,
        )
        .unwrap();
        let other_private_key = other_generated
            .to_openssh(russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let other_inspected = inspect_private_key_text(&other_private_key).unwrap();
        let other_record = BackupSshKey {
            key: StoredSshKey {
                id: uuid::Uuid::new_v4().to_string(),
                name: "id_ed25519_other".to_string(),
                note: None,
                algorithm: other_inspected.algorithm.clone(),
                fingerprint: other_inspected.fingerprint.clone(),
                encrypted: other_inspected.encrypted,
                imported_at: 456,
            },
            private_key: other_private_key.to_string(),
            passphrase: None,
        };
        let mut remote = vec![serde_json::to_value(&remote_record).unwrap()];
        let local = vec![
            serde_json::to_value(&local_record).unwrap(),
            serde_json::to_value(&other_record).unwrap(),
        ];

        let merged = super::merge_for_upload(Some(&remote), local).unwrap();

        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0]["note"], "local note");
        assert_eq!(merged[0]["passphrase"], "local passphrase");
        let conflicting = BackupSshKey {
            key: StoredSshKey {
                id: key_id,
                ..other_record.key.clone()
            },
            private_key: other_record.private_key.clone(),
            passphrase: None,
        };
        assert!(super::merge_for_upload(
            Some(&remote),
            vec![serde_json::to_value(&conflicting).unwrap()]
        )
        .is_err());
        zeroize_values(&mut remote);
        let mut merged = merged;
        zeroize_values(&mut merged);
    }
}
